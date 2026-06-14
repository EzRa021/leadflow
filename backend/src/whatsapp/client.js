import pkg from "whatsapp-web.js";
import qrcode from "qrcode";
import fs from "fs";

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

function findChrome() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      : null,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean);

  for (const path of candidates) {
    if (fs.existsSync(path)) return path;
  }
  return null;
}

export function getWhatsAppState() {
  return state;
}

export function initWhatsApp() {
  if (client) return client;

  const executablePath = findChrome();

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      ...(executablePath ? { executablePath } : {}),
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
