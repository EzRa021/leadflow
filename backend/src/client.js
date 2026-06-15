import pkg from "whatsapp-web.js";
import qrcode from "qrcode";
import { existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";

const { Client, LocalAuth } = pkg;

// ─────────────────────────────────────────────────────────
// Guards — prevent multiple Chromium instances
// ─────────────────────────────────────────────────────────
let client = null;
let isInitializing = false; // lock so concurrent calls don't spawn extras

let state = {
  status: "disconnected",
  qrDataUrl: null,
  info: null,
};

export function getWhatsAppState() {
  return state;
}

// ─────────────────────────────────────────────────────────
// Chrome path detection
// ─────────────────────────────────────────────────────────
function getChromePath() {
  const cacheDir = process.env.PUPPETEER_CACHE_DIR;
  if (cacheDir) {
    const chromeDir = join(cacheDir, "chrome");
    if (existsSync(chromeDir)) {
      const versions = readdirSync(chromeDir).filter((d) => d.startsWith("linux-"));
      for (const version of versions) {
        const bin = join(chromeDir, version, "chrome-linux64", "chrome");
        if (existsSync(bin)) {
          console.log("🌐 Found Chrome at:", bin);
          return bin;
        }
      }
    }
  }

  const roots = [
    "/opt/render/project/src/.cache/puppeteer",
    "/opt/render/project/.cache/puppeteer",
    join(process.cwd(), ".cache", "puppeteer"),
    "/opt/render/.cache/puppeteer",
  ];

  for (const root of roots) {
    const chromeDir = join(root, "chrome");
    if (!existsSync(chromeDir)) continue;
    const versions = readdirSync(chromeDir).filter((d) => d.startsWith("linux-"));
    for (const version of versions) {
      const bin = join(chromeDir, version, "chrome-linux64", "chrome");
      if (existsSync(bin)) {
        console.log("🌐 Found Chrome at:", bin);
        return bin;
      }
    }
  }

  console.error("❌ Chrome not found.");
  return null;
}

// ─────────────────────────────────────────────────────────
// Init — safe to call multiple times, only runs once
// ─────────────────────────────────────────────────────────
export function initWhatsApp() {
  if (client) {
    console.log("ℹ️  [WhatsApp] Client already exists, skipping init.");
    return client;
  }

  if (isInitializing) {
    console.log("ℹ️  [WhatsApp] Already initializing, skipping duplicate call.");
    return null;
  }

  isInitializing = true;
  console.log("🚀 [WhatsApp] Starting client (single instance)...");

  const executablePath = getChromePath();

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: "./.wwebjs_auth",
      clientId: "leadflow", // explicit ID prevents duplicate sessions
    }),
    puppeteer: {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",       // critical for low memory
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--disable-extensions",
        "--disable-software-rasterizer",
        "--disable-dev-tools",
        "--js-flags=--max-old-space-size=256", // cap Node heap at 256MB
        "--memory-pressure-off",
      ],
      // Removed --single-process: despite the name it actually uses MORE memory
    },
  });

  client.on("qr", async (qr) => {
    state.status = "qr";
    state.qrDataUrl = await qrcode.toDataURL(qr);
    console.log("📱 [WhatsApp] QR code ready — scan from the frontend.");
  });

  client.on("authenticated", () => {
    state.status = "connecting";
    state.qrDataUrl = null;
    console.log("🔑 [WhatsApp] Authenticated successfully.");
  });

  client.on("ready", () => {
    isInitializing = false;
    state.status = "ready";
    state.qrDataUrl = null;
    state.info = {
      pushname: client.info?.pushname,
      wid: client.info?.wid?.user,
    };
    console.log("✅ [WhatsApp] Client ready. Logged in as:", state.info.pushname);
  });

  client.on("disconnected", (reason) => {
    console.log("⚠️  [WhatsApp] Disconnected:", reason, "— restarting in 10s...");
    state.status = "disconnected";
    state.info = null;
    isInitializing = false;

    // Destroy cleanly before recreating
    client.destroy().catch(() => {}).finally(() => {
      client = null;
      setTimeout(() => initWhatsApp(), 10000);
    });
  });

  client.on("auth_failure", (msg) => {
    console.error("❌ [WhatsApp] Auth failure:", msg);
    state.status = "disconnected";
    isInitializing = false;
    client = null;
  });

  client.initialize().catch((err) => {
    console.error("❌ [WhatsApp] Failed to initialize:", err.message);
    state.status = "disconnected";
    isInitializing = false;
    client = null;
  });

  return client;
}

export function getClient() {
  return client;
}

export async function logoutWhatsApp() {
  if (client) {
    try { await client.logout(); } catch (e) {}
    try { await client.destroy(); } catch (e) {}
    client = null;
    isInitializing = false;
    state = { status: "disconnected", qrDataUrl: null, info: null };
  }
}
