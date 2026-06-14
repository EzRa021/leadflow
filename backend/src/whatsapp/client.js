import pkg from "whatsapp-web.js";
import qrcode from "qrcode";

// ─────────────────────────────────────────────────────────
// Singleton WhatsApp client manager.
// Holds connection state + latest QR code so the frontend
// can poll for them and display a "scan to connect" screen.
// ─────────────────────────────────────────────────────────
const { Client, LocalAuth } = pkg;
let client = null;
let state = {
  status: "disconnected", // disconnected | qr | connecting | ready
  qrDataUrl: null,
  info: null, // { pushname, wid } once ready
};

export function getWhatsAppState() {
  return state;
}

export function initWhatsApp() {
  if (client) return client;

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
    puppeteer: {
      headless: true,
      // These args are required for running Chromium inside Linux containers
      // (Render, Docker, etc.) where the sandbox and shared memory are restricted.
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",   // prevents crashes when /dev/shm is too small
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",          // keeps Chromium in one process (vital on Render)
        "--disable-extensions",
        "--disable-software-rasterizer",
      ],
      // Do NOT set executablePath — let Puppeteer use its own bundled Chromium.
      // Relying on system Chrome is unreliable on hosted Linux environments.
    },
  });

  client.on("qr", async (qr) => {
    state.status = "qr";
    state.qrDataUrl = await qrcode.toDataURL(qr);
    console.log("📱 New QR code generated — scan it from the frontend.");
  });

  client.on("authenticated", () => {
    state.status = "connecting";
    state.qrDataUrl = null;
    console.log("🔑 WhatsApp authenticated, finishing setup...");
  });

  client.on("ready", () => {
    state.status = "ready";
    state.qrDataUrl = null;
    state.info = {
      pushname: client.info?.pushname,
      wid: client.info?.wid?.user,
    };
    console.log("✅ WhatsApp client ready.");
  });

  client.on("disconnected", (reason) => {
    state.status = "disconnected";
    state.info = null;
    console.log("⚠️  WhatsApp disconnected:", reason);
  });

  client.on("auth_failure", (msg) => {
    state.status = "disconnected";
    console.error("❌ WhatsApp auth failure:", msg);
  });

  client.initialize().catch((err) => {
    console.error("❌ Failed to initialize WhatsApp client:", err.message);
    state.status = "disconnected";
  });

  return client;
}

export function getClient() {
  return client;
}

export async function logoutWhatsApp() {
  if (client) {
    try {
      await client.logout();
    } catch (e) {
      // ignore
    }
    try {
      await client.destroy();
    } catch (e) {
      // ignore
    }
    client = null;
    state = { status: "disconnected", qrDataUrl: null, info: null };
  }
}
