import pkg from "whatsapp-web.js";
import qrcode from "qrcode";
import { existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";

const { Client, LocalAuth } = pkg;

let client = null;
let isInitializing = false;
let restartTimer = null;

let state = {
  status: "disconnected",
  qrDataUrl: null,
  info: null,
};

export function getWhatsAppState() {
  return state;
}

// ─────────────────────────────────────────────────────────
// Chrome path — Docker sets PUPPETEER_EXECUTABLE_PATH to
// the system Chromium. Falls back to cache-based detection
// for non-Docker environments (local dev, Render, etc.)
// ─────────────────────────────────────────────────────────
function getChromePath() {
  // 1. Docker / explicit path via env var
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && existsSync(envPath)) {
    console.log("🌐 [Chrome] Using system Chromium:", envPath);
    return envPath;
  }

  // 2. Cache-based detection (Render / local)
  const roots = [
    process.env.PUPPETEER_CACHE_DIR,
    "/opt/render/project/src/.cache/puppeteer",
    join(process.cwd(), ".cache", "puppeteer"),
  ].filter(Boolean);

  for (const root of roots) {
    const chromeDir = join(root, "chrome");
    if (!existsSync(chromeDir)) continue;
    const versions = readdirSync(chromeDir).filter((d) =>
      d.startsWith("linux-")
    );
    for (const v of versions) {
      const bin = join(chromeDir, v, "chrome-linux64", "chrome");
      if (existsSync(bin)) {
        console.log("🌐 [Chrome] Found at:", bin);
        return bin;
      }
    }
  }

  console.error(
    "❌ [Chrome] Not found. Set PUPPETEER_EXECUTABLE_PATH env var."
  );
  return null;
}

function scheduleRestart(delayMs = 10000) {
  if (restartTimer) return;
  console.log(`🔄 [WhatsApp] Restarting in ${delayMs / 1000}s...`);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    initWhatsApp();
  }, delayMs);
}

export function initWhatsApp() {
  if (client) {
    console.log("ℹ️ [WhatsApp] Already running, skipping init.");
    return client;
  }
  if (isInitializing) {
    console.log(
      "ℹ️ [WhatsApp] Already initializing, skipping duplicate call."
    );
    return null;
  }

  isInitializing = true;
  console.log("🚀 [WhatsApp] Starting client...");

  const executablePath = getChromePath();
  mkdirSync("./.wwebjs_auth", { recursive: true });

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: "./.wwebjs_auth",
      clientId: "leadflow",
    }),
    puppeteer: {
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--disable-extensions",
        "--disable-software-rasterizer",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--hide-scrollbars",
        "--metrics-recording-only",
        "--mute-audio",
        "--safebrowsing-disable-auto-update",
        "--js-flags=--max-old-space-size=200",
      ],
    },
  });

  client.on("qr", async (qr) => {
    state.status = "qr";
    state.qrDataUrl = await qrcode.toDataURL(qr);
    console.log("📱 [WhatsApp] QR code ready — waiting for scan...");
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
    console.log("✅ [WhatsApp] Ready. Logged in as:", state.info.pushname);
  });

  client.on("disconnected", (reason) => {
    console.log("⚠️ [WhatsApp] Disconnected:", reason);
    state.status = "disconnected";
    state.info = null;
    isInitializing = false;
    client
      .destroy()
      .catch(() => {})
      .finally(() => {
        client = null;
        scheduleRestart(10000);
      });
  });

  client.on("auth_failure", (msg) => {
    console.error("❌ [WhatsApp] Auth failure:", msg);
    state.status = "disconnected";
    isInitializing = false;
    client = null;
    scheduleRestart(15000);
  });

  client.initialize().catch((err) => {
    console.error("❌ [WhatsApp] Failed to initialize:", err.message);
    state.status = "disconnected";
    isInitializing = false;
    client = null;
    scheduleRestart(15000);
  });

  return client;
}

export function getClient() {
  return client;
}

export async function logoutWhatsApp() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (client) {
    try {
      await client.logout();
    } catch (e) {}
    try {
      await client.destroy();
    } catch (e) {}
    client = null;
    isInitializing = false;
    state = { status: "disconnected", qrDataUrl: null, info: null };
  }
}
