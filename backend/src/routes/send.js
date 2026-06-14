import { Router } from "express";
import crypto from "crypto";
import { supabase } from "../db/supabase.js";
import { getClient, getWhatsAppState } from "../client.js";
import { renderTemplate, toWhatsAppId } from "../lib/messages.js";

const router = Router();

const SEND_DELAY_MS = Number(process.env.SEND_DELAY_MS || 8000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const jobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000;

function cleanupJobs() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
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

// GET /api/send/jobs/:jobId
router.get("/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found or expired." });

  res.json({
    id: job.id,
    status: job.status,
    total: job.total,
    sent: job.sent,
    failed: job.failed,
    skipped: job.skipped,
    remaining: job.total - job.sent - job.failed - job.skipped,
    templateName: job.templateName,
    log: job.log,
  });
});

// POST /api/send
// Body: { leadIds, confirmResend?, templateId?, rangeFrom?, rangeTo? }
// If leadIds is empty and rangeFrom/rangeTo are provided, fetch pending leads
// in the given 1-based range (ordered by created_at asc) and send those.
router.post("/", async (req, res) => {
  const {
    leadIds = [],
    confirmResend = false,
    templateId = null,
    rangeFrom,
    rangeTo,
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
    // Explicit lead IDs
    const { data, error } = await supabase.from("leads").select("*").in("id", leadIds);
    if (error) return res.status(500).json({ error: error.message });
    leads = data;
  } else if (rangeFrom != null && rangeTo != null) {
    // Range-based: fetch pending leads ordered by created_at asc, then slice
    const from1 = Math.max(1, Number(rangeFrom));
    const to1   = Math.max(from1, Number(rangeTo));
    const dbFrom = from1 - 1; // 0-based offset
    const dbTo   = to1 - 1;   // 0-based inclusive end

    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .range(dbFrom, dbTo);

    if (error) return res.status(500).json({ error: error.message });
    leads = data;
  } else {
    return res.status(400).json({ error: "Provide leadIds or rangeFrom+rangeTo." });
  }

  if (!leads || leads.length === 0) {
    return res.status(400).json({ error: "No leads found for the given selection." });
  }

  const alreadySent = leads.filter((l) => l.send_count > 0);
  if (alreadySent.length && !confirmResend) {
    return res.status(409).json({
      requiresConfirmation: true,
      alreadySent: alreadySent.length,
      alreadySentLeads: alreadySent.map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        sendCount: l.send_count,
        lastSentAt: l.last_sent_at,
      })),
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

  const defaultByPitch = new Map(
    allTemplates.filter((t) => t.is_default).map((t) => [t.pitch_type, t]),
  );

  function templateForLead(lead) {
    if (chosenTemplate) return chosenTemplate;
    return defaultByPitch.get(lead.pitch_type) || defaultByPitch.get("GENERIC") || allTemplates[0];
  }

  const estimatedSeconds = leads.length * (SEND_DELAY_MS / 1000);

  cleanupJobs();
  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    status: "running",
    total: leads.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    templateName: chosenTemplate ? chosenTemplate.name : "Per-category default",
    log: [],
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  res.json({
    started: true,
    jobId,
    total: leads.length,
    estimatedSeconds,
    templateName: job.templateName,
  });

  (async () => {
    const client = getClient();

    for (const lead of leads) {
      const whatsappId = toWhatsAppId(lead.phone);
      const template = templateForLead(lead);
      const message = renderTemplate(template.body, lead);

      let status = "sent";
      let note = null;

      try {
        const isRegistered = await client.isRegisteredUser(whatsappId);
        if (!isRegistered) {
          status = "skipped";
          note = "Not on WhatsApp";
        } else {
          await client.sendMessage(whatsappId, message);
        }
      } catch (err) {
        status = "failed";
        note = err.message;
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

      if (status === "sent") job.sent++;
      else if (status === "failed") job.failed++;
      else job.skipped++;

      job.log.push({
        at: new Date().toISOString(),
        name: lead.name,
        phone: lead.phone,
        status,
        note,
      });

      await sleep(SEND_DELAY_MS);
    }

    job.status = "done";
  })();
});

export default router;
