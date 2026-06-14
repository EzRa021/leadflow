import pkg from "whatsapp-web.js";
import qrcode from "qrcode";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

const { Client, LocalAuth } = pkg;

function getChromePath() {
  // Priority 1: explicit env var set in Render dashboard
  const cacheDir = process.env.PUPPETEER_CACHE_DIR;
  if (cacheDir) {
    const chromeDir = join(cacheDir, "chrome");
    console.log("ðŸ” Checking PUPPETEER_CACHE_DIR:", chromeDir);
    if (existsSync(chromeDir)) {
      const versions = readdirSync(chromeDir).filter((d) => d.startsWith("linux-"));
      for (const version of versions) {
        const bin = join(chromeDir, version, "chrome-linux64", "chrome");
        if (existsSync(bin)) {
          console.log("ðŸŒ Found Chrome at:", bin);
          return bin;
        }
      }
    }
  }

  // Priority 2: scan all known possible locations
  const roots = [
    "/opt/render/project/src/.cache/puppeteer",
    "/opt/render/project/.cache/puppeteer",
    join(process.cwd(), ".cache", "puppeteer"),
    "/opt/render/.cache/puppeteer",
  ];

  for (const root of roots) {
    const chromeDir = join(root, "chrome");
    console.log("ðŸ” Checking:", chromeDir);
    if (!existsSync(chromeDir)) continue;
    const versions = readdirSync(chromeDir).filter((d) => d.startsWith("linux-"));
    for (const version of versions) {
      const bin = join(chromeDir, version, "chrome-linux64", "chrome");
      if (existsSync(bin)) {
        console.log("ðŸŒ Found Chrome at:", bin);
        return bin;
      }
    }
  }

  console.error("âŒ Chrome not found in any location. Searched:", roots);
  return null;
}

let client = null;
let state = {
  status: "disconnected",
  qrDataUrl: null,
  info: null,
};

export function getWhatsAppState() {
  return state;
}

export function initWhatsApp() {
  if (client) return client;

  const executablePath = getChromePath();

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
    console.log("ðŸ“± New QR code generated â€” scan it from the frontend.");
  });

  client.on("authenticated", () => {
    state.status = "connecting";
    state.qrDataUrl = null;
    console.log("ðŸ”‘ WhatsApp authenticated, finishing setup...");
  });

  client.on("ready", () => {
    state.status = "ready";
    state.qrDataUrl = null;
    state.info = {
      pushname: client.info?.pushname,
      wid: client.info?.wid?.user,
    };
    console.log("âœ… WhatsApp client ready.");
  });

  client.on("disconnected", (reason) => {
    state.status = "disconnected";
    state.info = null;
    console.log("âš ï¸  WhatsApp disconnected:", reason);
  });

  client.on("auth_failure", (msg) => {
    state.status = "disconnected";
    console.error("âŒ WhatsApp auth failure:", msg);
  });

  client.initialize().catch((err) => {
    console.error("âŒ Failed to initialize WhatsApp client:", err.message);
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
