import pkg from "whatsapp-web.js";
import qrcode from "qrcode";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { createRequire } from "module";

const { Client, LocalAuth } = pkg;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Dynamically find whatever Chrome version Puppeteer
// downloaded â€” avoids hardcoding a version number that
// drifts every Puppeteer release.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getChromePath() {
  const searchRoots = [
    "/opt/render/.cache/puppeteer",             // Render default cache
    join(process.cwd(), ".cache", "puppeteer"), // project-local cache
  ];

  for (const root of searchRoots) {
    if (!existsSync(root)) continue;

    // Walk: root/chrome/linux-<version>/chrome-linux64/chrome
    const chromeDir = join(root, "chrome");
    if (!existsSync(chromeDir)) continue;

    const versions = readdirSync(chromeDir).filter((d) => d.startsWith("linux-"));
    for (const version of versions) {
      const bin = join(chromeDir, version, "chrome-linux64", "chrome");
      if (existsSync(bin)) {
        console.log(`ðŸŒ Found Chrome at: ${bin}`);
        return bin;
      }
    }
  }

  // Fallback: ask Puppeteer itself
  try {
    const require = createRequire(import.meta.url);
    const puppeteer = require("puppeteer");
    const path = puppeteer.executablePath();
    if (path && existsSync(path)) {
      console.log(`ðŸŒ Puppeteer reports Chrome at: ${path}`);
      return path;
    }
  } catch (e) {
    // ignore
  }

  console.warn("âš ï¸  Chrome not found in any known location.");
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
