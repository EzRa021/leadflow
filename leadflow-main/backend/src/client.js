import pkg from "whatsapp-web.js";
import qrcode from "qrcode";
import { existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { supabase } from "./db/supabase.js";
import { logLeadEvent } from "./lib/events.js";
import { toWhatsAppId } from "./lib/messages.js";

const { Client, LocalAuth } = pkg;

let client = null;
let isInitializing = false;
let restartTimer = null;
// Set when the user explicitly logs out. Suppresses BOTH the backend
// auto-restart and the frontend auto-connect so a manual disconnect actually
// sticks instead of immediately reconnecting from the persisted LocalAuth
// session. Cleared the moment an explicit connect (initWhatsApp) runs.
let manualDisconnect = false;

let state = {
  status: "disconnected",
  qrDataUrl: null,
  info: null,
};

export function getWhatsAppState() {
  return { ...state, manualDisconnect };
}

// Race a promise against a timeout so a hung whatsapp-web.js call (logout is
// known to sometimes hang) can't wedge the HTTP request forever.
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
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

  // 2. Cache-based detection (Render / local). Windows and Linux Puppeteer
  // installs use different folder-name prefixes and binary paths under the
  // same cache root, so both must be checked — a prior version of this only
  // checked "linux-", which silently returned null on every Windows machine
  // even after a clean `npx puppeteer browsers install chrome`.
  const roots = [
    process.env.PUPPETEER_CACHE_DIR,
    "/opt/render/project/src/.cache/puppeteer",
    join(process.cwd(), ".cache", "puppeteer"),
    join(process.env.USERPROFILE || "", ".cache", "puppeteer"), // Windows default cache root
  ].filter(Boolean);

  const PLATFORM_BUILDS = [
    { prefix: "linux-", relBin: ["chrome-linux64", "chrome"] },
    { prefix: "win64-", relBin: ["chrome-win64", "chrome.exe"] },
    { prefix: "win32-", relBin: ["chrome-win32", "chrome.exe"] },
    { prefix: "mac-", relBin: ["chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"] },
    { prefix: "mac_arm-", relBin: ["chrome-mac_arm", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"] },
  ];

  for (const root of roots) {
    const chromeDir = join(root, "chrome");
    if (!existsSync(chromeDir)) continue;
    const entries = readdirSync(chromeDir);
    for (const build of PLATFORM_BUILDS) {
      const versions = entries.filter((d) => d.startsWith(build.prefix));
      for (const v of versions) {
        const bin = join(chromeDir, v, ...build.relBin);
        if (existsSync(bin)) {
          console.log("Chrome found at:", bin);
          return bin;
        }
      }
    }
  }

  console.error(
    "Chrome not found. Set PUPPETEER_EXECUTABLE_PATH env var, or run: npx puppeteer browsers install chrome. " +
    "If that folder exists but this still fails, the install is likely corrupt - delete the versioned folder under <cache>/chrome/ and reinstall."
  );
  return null;
}

function scheduleRestart(delayMs = 10000) {
  if (manualDisconnect) return; // user logged out on purpose — don't reconnect
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

  // An explicit connect clears the manual-disconnect latch.
  manualDisconnect = false;
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

  client.on("message", (message) => {
    handleInboundMessage(message).catch((err) => {
      console.error("[inbox] failed to process inbound message:", err.message);
    });
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

// ─────────────────────────────────────────────────────────────────
// Reply / inbox handling (Tier 2 roadmap item #6)
//
// LeadFlow only ever sends outbound; this closes the loop by listening
// for inbound WhatsApp messages, matching them back to a lead by phone
// number, recording them in `inbox_messages`, and flagging the lead as
// `replied` so it surfaces in an inbox view instead of silently sitting
// in whatsapp-web.js with no trace in the app.
// ─────────────────────────────────────────────────────────────────

// WhatsApp ids look like "234XXXXXXXXXX@c.us" for individuals and
// "...@g.us" for groups — leads are only ever individuals.
function phoneFromWhatsAppId(id = "") {
  if (!id.endsWith("@c.us")) return null;
  return id.replace("@c.us", "");
}

async function handleInboundMessage(message) {
  // Ignore messages we sent ourselves and anything from groups/broadcasts —
  // only 1:1 replies from a lead's number are relevant to the inbox.
  if (message.fromMe) return;
  const phone = phoneFromWhatsAppId(message.from);
  if (!phone) return;

  const body = (message.body || "").trim();
  if (!body) return; // media-only messages with no caption: nothing to show in a text inbox yet

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, name, status")
    .eq("phone", phone)
    .maybeSingle();

  if (leadErr) {
    console.error("[inbox] lead lookup failed:", leadErr.message);
    return;
  }
  if (!lead) return; // message from a number that isn't a tracked lead — not our concern

  const { error: insertErr } = await supabase.from("inbox_messages").insert({
    lead_id: lead.id,
    direction: "inbound",
    body,
    whatsapp_message_id: message.id?._serialized || null,
  });
  if (insertErr) {
    // Unique-constraint hit (duplicate whatsapp_message_id) is expected/benign
    // on a reconnect replay; anything else is worth logging.
    if (!insertErr.message?.includes("duplicate key")) {
      console.error("[inbox] failed to insert inbound message:", insertErr.message);
    }
    return;
  }

  if (lead.status !== "replied") {
    await supabase.from("leads").update({ status: "replied" }).eq("id", lead.id);
  }

  logLeadEvent(lead.id, "replied", body.length > 140 ? body.slice(0, 140) + "…" : body).catch(() => {});

  console.log(`💬 [inbox] reply from ${lead.name} (${phone})`);
}

// Used by the inbox routes to send a manual reply from the dashboard.
// Returns the sent message so the caller can record it in inbox_messages
// with the real whatsapp_message_id.
export async function sendManualReply(phone, body) {
  if (!client) throw new Error("WhatsApp client is not connected.");
  return client.sendMessage(toWhatsAppId(phone), body);
}

export function getClient() {
  return client;
}

export async function logoutWhatsApp() {
  // Latch first so any 'disconnected' event fired by destroy() below can't
  // schedule an auto-restart, and the frontend stops auto-connecting.
  manualDisconnect = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (client) {
    // logout() invalidates the persisted LocalAuth session (so reconnect needs
    // a fresh QR scan); destroy() tears down the browser. Both are bounded so
    // a hang can't wedge the request.
    try { await withTimeout(client.logout(), 8000); } catch (e) {}
    try { await withTimeout(client.destroy(), 5000); } catch (e) {}
    client = null;
    isInitializing = false;
  }
  // destroy() can emit 'disconnected' asynchronously and re-arm the timer —
  // clear it again after the teardown.
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  state = { status: "disconnected", qrDataUrl: null, info: null };
}
