import { asyncRouter } from "../lib/asyncRouter.js";
import { supabase } from "../db/supabase.js";
import { getClient, getWhatsAppState } from "../client.js";
import { renderTemplate, toWhatsAppId } from "../lib/messages.js";
import { logLeadEvent } from "../lib/events.js";
import { initJobCancelBridge } from "../lib/realtime.js";
import { applyLeadsFilters, applyLeadsSort } from "../lib/leadsQuery.js";

const router = asyncRouter();

const SEND_DELAY_MS = Number(process.env.SEND_DELAY_MS || 8000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────
// Spam-safety controls — protect the WhatsApp number from being
// flagged/banned by not behaving like a bot: randomized jitter
// between sends, a hard daily send cap, and a business-hours window.
// All configurable via env vars, with safe defaults.
// ─────────────────────────────────────────────
const SEND_DELAY_MIN_MS = Number(process.env.SEND_DELAY_MIN_MS || Math.round(SEND_DELAY_MS * 0.75));
const SEND_DELAY_MAX_MS = Number(process.env.SEND_DELAY_MAX_MS || Math.round(SEND_DELAY_MS * 1.5));
const DAILY_SEND_CAP = Number(process.env.DAILY_SEND_CAP || 150); // 0 = unlimited
const BUSINESS_HOURS_START = Number(process.env.BUSINESS_HOURS_START ?? 8);  // 24h, server-local time
const BUSINESS_HOURS_END = Number(process.env.BUSINESS_HOURS_END ?? 20);    // 24h, server-local time
const BUSINESS_HOURS_ENABLED = process.env.BUSINESS_HOURS_ENABLED !== "false";

function randomDelayMs() {
  const min = Math.min(SEND_DELAY_MIN_MS, SEND_DELAY_MAX_MS);
  const max = Math.max(SEND_DELAY_MIN_MS, SEND_DELAY_MAX_MS);
  return Math.round(min + Math.random() * (max - min));
}

function isWithinBusinessHours(date = new Date()) {
  if (!BUSINESS_HOURS_ENABLED) return true;
  const hour = date.getHours();
  if (BUSINESS_HOURS_START <= BUSINESS_HOURS_END) {
    return hour >= BUSINESS_HOURS_START && hour < BUSINESS_HOURS_END;
  }
  // Wraps past midnight (e.g. start 20, end 6)
  return hour >= BUSINESS_HOURS_START || hour < BUSINESS_HOURS_END;
}

// Milliseconds to wait until the next moment business hours are open.
function msUntilBusinessHoursStart(date = new Date()) {
  const next = new Date(date);
  next.setHours(BUSINESS_HOURS_START, 0, 0, 0);
  if (next <= date) next.setDate(next.getDate() + 1);
  return next.getTime() - date.getTime();
}

// Milliseconds to wait until midnight (server-local), used to reset the daily cap.
function msUntilNextMidnight(date = new Date()) {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - date.getTime();
}

async function countSentToday() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("send_log")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("created_at", startOfDay.toISOString());
  if (error) {
    console.error("[send] failed to count today's sends:", error.message);
    return 0;
  }
  return count || 0;
}

const activeJobs = new Map(); // jobId -> cancel function

// Cross-instance stop bridge (Tier 2 #7). If this instance holds the
// cancel function for a job that another instance just flagged to stop,
// fire it immediately instead of waiting for this instance's own
// polling checkpoints to notice `stop_requested`. Safe no-op on a
// single-instance deployment (every stop already originates locally).
initJobCancelBridge((jobId) => {
  const cancel = activeJobs.get(jobId);
  if (cancel) {
    console.log(`[send] realtime bridge triggering cancel for job ${jobId}`);
    cancel();
  }
});

function sleepForJob(jobId, ms) {
  let timeoutId;
  let rejectFn;

  const promise = new Promise((resolve, reject) => {
    timeoutId = setTimeout(resolve, ms);
    rejectFn = reject;
  });

  activeJobs.set(jobId, () => {
    clearTimeout(timeoutId);
    rejectFn(new Error("CANCELLED"));
  });

  return promise.finally(() => {
    activeJobs.delete(jobId);
  });
}

// Hard upper bound on a single WhatsApp operation (isRegisteredUser /
// sendMessage). whatsapp-web.js drives a headless Chrome page and is known
// to occasionally hang indefinitely (detached frame, page reload, rate-limit
// backoff). Without a bound, a stuck send freezes the whole loop AND makes
// "Stop Sending" a no-op, because the cancel signal can't preempt a bare
// awaited promise. Configurable, defaults to 60s.
const SEND_TIMEOUT_MS = Number(process.env.SEND_TIMEOUT_MS || 60000);

// Runs an in-flight WhatsApp operation such that (a) a Stop request can
// interrupt it immediately — the same activeJobs cancel mechanism used for
// sleeps is registered for the whole operation, not just the idle delay —
// and (b) it can never hang forever, via a hard timeout. Rejects with
// Error("CANCELLED") if stopped mid-flight, or Error("TIMEOUT") if it
// exceeds SEND_TIMEOUT_MS.
function runCancellableSend(jobId, fn) {
  let timeoutId;
  let rejectFn;

  const guard = new Promise((_, reject) => {
    rejectFn = reject;
    timeoutId = setTimeout(() => reject(new Error("TIMEOUT")), SEND_TIMEOUT_MS);
  });

  // Registering here means a stop click during isRegisteredUser()/sendMessage()
  // finds a live cancel function (previously activeJobs was empty during the
  // send, so cancel() was a silent no-op and Stop did nothing until the send
  // resolved on its own).
  activeJobs.set(jobId, () => rejectFn(new Error("CANCELLED")));

  return Promise.race([Promise.resolve().then(fn), guard]).finally(() => {
    clearTimeout(timeoutId);
    activeJobs.delete(jobId);
  });
}

// Log is capped so the DB row / JSON payload doesn't grow unbounded on huge sends.
const MAX_LOG_ENTRIES = 200;

// ─────────────────────────────────────────────
// Job persistence helpers (all state lives in `send_jobs`,
// nothing lives only in server memory — a restart or refresh
// never loses progress).
// ─────────────────────────────────────────────

async function loadJob(jobId) {
  const { data, error } = await supabase.from("send_jobs").select("*").eq("id", jobId).single();
  if (error) return null;
  return data;
}

async function patchJob(jobId, updates) {
  const { error } = await supabase.from("send_jobs").update(updates).eq("id", jobId);
  if (error) console.error(`[send_jobs] failed to update ${jobId}:`, error.message);
}

function toApiShape(job) {
  const remaining = job.total - job.sent - job.failed - job.skipped;
  return {
    id: job.id,
    status: job.status, // running | stopping | stopped | done
    total: job.total,
    sent: job.sent,
    failed: job.failed,
    skipped: job.skipped,
    remaining: Math.max(0, remaining),
    templateName: job.template_name,
    log: job.log || [],
  };
}

// Runs (or resumes) a job's send loop. Safe to call again for a job that
// already has cursor > 0 — it just picks up where it left off.
async function runJob(jobId) {
  const job = await loadJob(jobId);
  if (!job) return;
  if (job.status === "done" || job.status === "stopped") return;

  const client = getClient();
  const leadIds = job.lead_ids;

  const { data: allTemplates } = await supabase.from("templates").select("*");
  const defaultByPitch = new Map(
    (allTemplates || []).filter((t) => t.is_default).map((t) => [t.pitch_type, t]),
  );
  const chosenTemplate = job.template_id
    ? (allTemplates || []).find((t) => t.id === job.template_id)
    : null;

  function templateForLead(lead) {
    if (chosenTemplate) return chosenTemplate;
    return defaultByPitch.get(lead.pitch_type) || defaultByPitch.get("GENERIC") || allTemplates?.[0];
  }

  let sent = job.sent;
  let failed = job.failed;
  let skipped = job.skipped;
  let log = job.log || [];

  for (let i = job.cursor; i < leadIds.length; i++) {
    // Check the stop flag fresh from the DB before every send — this is what
    // makes Stop Sending take effect immediately instead of after the queue drains.
    const { data: flagRow } = await supabase
      .from("send_jobs")
      .select("stop_requested")
      .eq("id", jobId)
      .single();

    if (flagRow?.stop_requested) {
      await patchJob(jobId, { status: "stopped", cursor: i });
      return;
    }

    // ── Spam-safety gate: business hours ──
    // Pauses the loop (without failing/skipping the lead) until the
    // configured window reopens. Uses the cancelable sleep so Stop
    // Sending still works instantly while paused.
    if (!isWithinBusinessHours()) {
      const waitMs = msUntilBusinessHoursStart();
      log = [...log, {
        at: new Date().toISOString(), name: "System", phone: "", status: "paused",
        note: `Outside business hours (${BUSINESS_HOURS_START}:00–${BUSINESS_HOURS_END}:00) — resuming automatically`,
      }];
      await patchJob(jobId, { log });
      try {
        await sleepForJob(jobId, waitMs);
      } catch (err) {
        if (err.message === "CANCELLED") {
          await patchJob(jobId, { status: "stopped", cursor: i });
          return;
        }
      }
    }

    // ── Spam-safety gate: daily send cap ──
    if (DAILY_SEND_CAP > 0) {
      const sentToday = await countSentToday();
      if (sentToday >= DAILY_SEND_CAP) {
        const waitMs = msUntilNextMidnight();
        log = [...log, {
          at: new Date().toISOString(), name: "System", phone: "", status: "paused",
          note: `Daily send cap reached (${DAILY_SEND_CAP}/day) — resuming after midnight`,
        }];
        await patchJob(jobId, { log });
        try {
          await sleepForJob(jobId, waitMs);
        } catch (err) {
          if (err.message === "CANCELLED") {
            await patchJob(jobId, { status: "stopped", cursor: i });
            return;
          }
        }
        // Loop back around to re-check the stop flag / business hours
        // fresh before actually sending, rather than assuming it's safe now.
        i--;
        continue;
      }
    }

    // ── Crash-safety: commit the cursor advance BEFORE the actual send ──
    // The core promise of LeadFlow is "never accidentally re-message a lead".
    // The send (WhatsApp) and the DB writes that record it can't be made
    // atomic, so if the process dies mid-send we must choose which way to
    // fail. By persisting cursor = i+1 *before* sending, a crash/restart
    // resumes at the NEXT lead and never re-sends this one. Worst case we
    // skip a lead that may not have gone out — it stays `pending`, visible,
    // and re-queueable — which is strictly safer than double-messaging.
    await patchJob(jobId, { cursor: i + 1 });

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadIds[i])
      .single();

    if (leadErr || !lead) {
      skipped++;
    } else {
      const whatsappId = toWhatsAppId(lead.phone);
      const template = templateForLead(lead);

      let status = "sent";
      let note = null;
      let message = null;

      if (!template) {
        // No default template for this pitch_type, no GENERIC fallback, and
        // no templates at all in the table — nothing to render. Fail this
        // lead instead of crashing the whole job on `template.body`.
        status = "failed";
        note = `No template available for pitch_type "${lead.pitch_type}" (and no GENERIC fallback configured).`;
      } else {
        message = renderTemplate(template.body, lead);
        try {
          const isRegistered = await runCancellableSend(jobId, () =>
            client.isRegisteredUser(whatsappId),
          );
          if (!isRegistered) {
            status = "skipped";
            note = "Not on WhatsApp";
          } else {
            await runCancellableSend(jobId, () =>
              client.sendMessage(whatsappId, message),
            );
          }
        } catch (err) {
          if (err.message === "CANCELLED") {
            // Stop was requested while this send was in flight. Finalize the
            // job now instead of finishing the loop. cursor is already at
            // i+1 (pre-committed above), so this lead won't be retried.
            console.log(`[send] send cancelled mid-flight for job ${jobId}, marking stopped`);
            await patchJob(jobId, { sent, failed, skipped, log, status: "stopped" });
            return;
          }
          status = "failed";
          note = err.message === "TIMEOUT"
            ? `Send timed out after ${Math.round(SEND_TIMEOUT_MS / 1000)}s`
            : err.message;
        }
      }

      await supabase
        .from("leads")
        .update({
          status,
          send_count: status === "sent" ? lead.send_count + 1 : lead.send_count,
          last_sent_at: status === "sent" ? new Date().toISOString() : lead.last_sent_at,
          last_message: status === "sent" ? message : lead.last_message,
          last_error: status === "failed" ? note : null,
        })
        .eq("id", lead.id);

      await supabase.from("send_log").insert({
        lead_id: lead.id,
        status,
        message: status === "sent" ? message : null,
        note,
        template_id: template?.id || null,
        template_name: template?.name || null,
      });

      logLeadEvent(
        lead.id,
        status, // "sent" | "failed" | "skipped"
        status === "sent" ? `Message sent via "${template?.name || "template"}"` : (note || status),
      ).catch(() => {});

      if (status === "sent") sent++;
      else if (status === "failed") failed++;
      else skipped++;

      log = [...log, { at: new Date().toISOString(), name: lead.name, phone: lead.phone, status, note }];
      if (log.length > MAX_LOG_ENTRIES) log = log.slice(log.length - MAX_LOG_ENTRIES);
    }

    await patchJob(jobId, { sent, failed, skipped, log, cursor: i + 1 });

    const { data: flagRow2 } = await supabase
      .from("send_jobs")
      .select("stop_requested")
      .eq("id", jobId)
      .single();

    if (flagRow2?.stop_requested) {
      await patchJob(jobId, { status: "stopped", cursor: i + 1 });
      return;
    }

    try {
      await sleepForJob(jobId, randomDelayMs());
    } catch (err) {
      if (err.message === "CANCELLED") {
        console.log(`[send] sleep cancelled for job ${jobId}, marking stopped`);
        await patchJob(jobId, { status: "stopped", cursor: i + 1 });
        return;
      }
    }
  }

  await patchJob(jobId, { status: "done", cursor: leadIds.length });
}

// Called once at server startup so a redeploy/crash mid-send resumes
// automatically instead of leaving a job stuck as "running" forever.
export async function resumeIncompleteJobs() {
  const { data, error } = await supabase
    .from("send_jobs")
    .select("id")
    .in("status", ["running", "stopping"]);

  if (error || !data?.length) return;

  for (const { id } of data) {
    console.log(`🔄 [send] resuming interrupted job ${id}`);
    runJob(id).catch((err) => console.error(`[send] job ${id} crashed:`, err));
  }
}

// POST /api/send/check
router.post("/check", async (req, res) => {
  const { leadIds } = req.body;
  if (!Array.isArray(leadIds) || !leadIds.length) {
    return res.status(400).json({ error: "leadIds must be a non-empty array." });
  }

  const { data, error } = await supabase
    .from("leads")
    .select("id, name, phone, status, send_count, last_sent_at")
    .in("id", leadIds);

  if (error) return res.status(500).json({ error: error.message });

  const alreadySent = data.filter((l) => l.send_count > 0);
  const fresh = data.filter((l) => l.send_count === 0);

  res.json({
    total: data.length,
    fresh: fresh.length,
    alreadySent: alreadySent.length,
    alreadySentLeads: alreadySent.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      status: l.status,
      sendCount: l.send_count,
      lastSentAt: l.last_sent_at,
    })),
  });
});

// GET /api/send/config
// Exposes the send pacing so the frontend's pre-send "estimated duration"
// reflects the actual (env-configurable, randomized) delay instead of a
// hardcoded guess. avgDelaySeconds is the midpoint of the jitter window.
router.get("/config", (req, res) => {
  const min = Math.min(SEND_DELAY_MIN_MS, SEND_DELAY_MAX_MS);
  const max = Math.max(SEND_DELAY_MIN_MS, SEND_DELAY_MAX_MS);
  res.json({ avgDelaySeconds: Math.round((min + max) / 2 / 1000) });
});

// GET /api/send/jobs/active
// Returns the most recent running/stopping job, if any — lets the frontend
// restore the progress modal on page load/refresh without needing a stored jobId.
router.get("/jobs/active", async (req, res) => {
  const { data, error } = await supabase
    .from("send_jobs")
    .select("*")
    .in("status", ["running", "stopping"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ job: null });
  res.json({ job: toApiShape(data) });
});

// GET /api/send/jobs/:jobId
router.get("/jobs/:jobId", async (req, res) => {
  const job = await loadJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(toApiShape(job));
});

// POST /api/send/jobs/:jobId/stop
// Sets a flag the running loop checks before every send — the current
// in-flight message (if any) finishes, but no further messages go out.
router.post("/jobs/:jobId/stop", async (req, res) => {
  const job = await loadJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found." });
  if (job.status === "done" || job.status === "stopped") {
    return res.json(toApiShape(job));
  }

  await patchJob(req.params.jobId, { status: "stopping", stop_requested: true });

  const cancel = activeJobs.get(req.params.jobId);
  if (cancel) {
    console.log(`[send] triggering immediate cancel for job ${req.params.jobId}`);
    cancel();
  }

  const updated = await loadJob(req.params.jobId);
  res.json(toApiShape(updated));
});

// POST /api/send
// Body: { leadIds, confirmResend?, templateId?, rangeFrom?, rangeTo? }
router.post("/", async (req, res) => {
  const {
    leadIds = [],
    confirmResend = false,
    templateId = null,
    rangeFrom,
    rangeTo,
    search,
    pitch_type,
    category,
    has_website,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
  } = req.body;

  const state = getWhatsAppState();
  if (state.status !== "ready") {
    return res.status(503).json({
      error: "WhatsApp is not connected. Connect it first from the dashboard.",
      status: state.status,
    });
  }

  let leads;

  if (Array.isArray(leadIds) && leadIds.length > 0) {
    const { data, error } = await supabase.from("leads").select("*").in("id", leadIds);
    if (error) return res.status(500).json({ error: error.message });
    leads = data;
  } else if (rangeFrom != null && rangeTo != null) {
    const from1 = Math.max(1, Number(rangeFrom));
    const to1 = Math.max(from1, Number(rangeTo));
    const dbFrom = from1 - 1;
    const dbTo = to1 - 1;

    let query = supabase.from("leads").select("*");
    query = applyLeadsFilters(query, {
      status: "pending",
      pitch_type,
      category,
      has_website,
      search,
      dateFrom,
      dateTo,
    });

    query = applyLeadsSort(query, sortBy, sortDir).range(dbFrom, dbTo);

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    leads = data;
  } else {
    return res.status(400).json({ error: "Provide leadIds or rangeFrom+rangeTo." });
  }

  if (!leads || leads.length === 0) {
    return res.status(400).json({ error: "No leads found for the given selection." });
  }

  // Guard against two jobs processing the same leads at once. Without this,
  // a manual send that overlaps a still-running (or crash-resumed) job would
  // spin up a second runJob loop over the same lead ids — double-sending and
  // racing on send_count. Distinct from the resend 409 below: no
  // `requiresConfirmation` flag, so the frontend surfaces it as an error
  // rather than the resend modal.
  const { data: liveJobs } = await supabase
    .from("send_jobs")
    .select("lead_ids")
    .in("status", ["running", "stopping"]);

  if (liveJobs?.length) {
    const busy = new Set(liveJobs.flatMap((j) => j.lead_ids || []));
    const conflicts = leads.filter((l) => busy.has(l.id));
    if (conflicts.length) {
      return res.status(409).json({
        conflict: true,
        error: `${conflicts.length} of these leads are already being sent by another active job. Wait for it to finish or stop it first.`,
        conflictingLeadCount: conflicts.length,
      });
    }
  }

  const alreadySent = leads.filter((l) => l.send_count > 0);
  if (alreadySent.length && !confirmResend) {
    return res.status(409).json({
      requiresConfirmation: true,
      total: leads.length,
      alreadySent: alreadySent.length,
      alreadySentLeads: alreadySent.map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        sendCount: l.send_count,
        lastSentAt: l.last_sent_at,
      })),
      // The full resolved lead-id set for this attempt (range or explicit),
      // so the frontend can resend by id list without re-supplying
      // rangeFrom/rangeTo/filters on the confirm call.
      leadIds: leads.map((l) => l.id),
      message: `${alreadySent.length} of these leads were already messaged. Resend anyway?`,
    });
  }

  const { data: allTemplates, error: templatesErr } = await supabase.from("templates").select("*");
  if (templatesErr) return res.status(500).json({ error: templatesErr.message });

  let chosenTemplate = null;
  if (templateId) {
    chosenTemplate = allTemplates.find((t) => t.id === templateId);
    if (!chosenTemplate) return res.status(400).json({ error: "Template not found." });
  }

  const templateName = chosenTemplate ? chosenTemplate.name : "Per-category default";
  const estimatedSeconds = leads.length * (SEND_DELAY_MS / 1000);

  const { data: jobRow, error: jobErr } = await supabase
    .from("send_jobs")
    .insert({
      status: "running",
      total: leads.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      template_name: templateName,
      template_id: chosenTemplate?.id || null,
      lead_ids: leads.map((l) => l.id),
      cursor: 0,
      log: [],
      stop_requested: false,
    })
    .select()
    .single();

  if (jobErr) return res.status(500).json({ error: jobErr.message });

  res.json({
    started: true,
    jobId: jobRow.id,
    total: leads.length,
    estimatedSeconds,
    templateName,
  });

  runJob(jobRow.id).catch((err) => console.error(`[send] job ${jobRow.id} crashed:`, err));
});

export default router;
