import pkg from "whatsapp-web.js";
import qrcode from "qrcode";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { createRequire } from "module";

const { Client, LocalAuth } = pkg;

// ─────────────────────────────────────────────────────────
// Resolve Puppeteer's bundled Chromium path at runtime.
// On Render, Chrome is downloaded to .cache/puppeteer inside
// the project directory during the build step.
// ─────────────────────────────────────────────────────────
function getChromePath() {
  // 1. Check project-local cache (set by .puppeteerrc.cjs)
  const localCache = join(process.cwd(), ".cache", "puppeteer");
  const localChrome = join(localCache, "chrome", "linux-146.0.7680.31", "chrome-linux64", "chrome");
  if (existsSync(localChrome)) return localChrome;

  // 2. Check Render's default puppeteer cache
  const renderCache = "/opt/render/.cache/puppeteer";
  const renderChrome = join(renderCache, "chrome", "linux-146.0.7680.31", "chrome-linux64", "chrome");
  if (existsSync(renderChrome)) return renderChrome;

  // 3. Ask Puppeteer itself where it put Chrome
  try {
    const require = createRequire(import.meta.url);
    const puppeteer = require("puppeteer");
    const path = puppeteer.executablePath();
    if (path && existsSync(path)) return path;
  } catch (e) {
    // ignore
  }

  return null; // let Puppeteer try on its own
}

let client = null;
let state = {
  status: "disconnected", // disconnected | qr | connecting | ready
  qrDataUrl: null,
  info: null,
};

export function getWhatsAppState() {
  return state;
}

export function initWhatsApp() {
  if (client) return client;

  const executablePath = getChromePath();
  if (executablePath) {
    console.log("🌐 Using Chrome at:", executablePath);
  } else {
    console.warn("⚠️  Chrome path not found — Puppeteer will attempt auto-discovery.");
  }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
    puppeteer: {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-extensions",
        "--disable-software-rasterizer",
      ],
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
    try { await client.logout(); } catch (e) {}
    try { await client.destroy(); } catch (e) {}
    client = null;
    state = { status: "disconnected", qrDataUrl: null, info: null };
  }
}
