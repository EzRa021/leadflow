import { asyncRouter } from "../lib/asyncRouter.js";
import { supabase } from "../db/supabase.js";
import { sendManualReply } from "../client.js";
import { logLeadEvent } from "../lib/events.js";

const router = asyncRouter();

// GET /api/inbox
// Conversation list: one row per lead that has at least one inbound message,
// most recently-replied first, with unread counts — the "inbox" view.
router.get("/", async (req, res) => {
  const { data: messages, error } = await supabase
    .from("inbox_messages")
    .select("id, lead_id, direction, body, is_read, created_at")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Group into one conversation per lead_id, keeping the latest message
  // and counting unread inbound messages, without a second round trip.
  const byLead = new Map();
  for (const m of messages || []) {
    if (!byLead.has(m.lead_id)) {
      byLead.set(m.lead_id, {
        leadId: m.lead_id,
        lastMessage: m.body,
        lastDirection: m.direction,
        lastAt: m.created_at,
        unreadCount: 0,
      });
    }
    if (m.direction === "inbound" && !m.is_read) {
      byLead.get(m.lead_id).unreadCount++;
    }
  }

  const leadIds = [...byLead.keys()];
  if (!leadIds.length) return res.json({ conversations: [] });

  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("id, name, phone, phone_raw, category, pitch_type, status")
    .in("id", leadIds);

  if (leadsErr) return res.status(500).json({ error: leadsErr.message });

  const leadById = new Map((leads || []).map((l) => [l.id, l]));

  const conversations = [...byLead.values()]
    .map((c) => ({ ...c, lead: leadById.get(c.leadId) || null }))
    .filter((c) => c.lead) // lead may have been deleted since the message came in
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

  res.json({ conversations });
});

// GET /api/inbox/:leadId
// Full message thread for one lead, oldest first (chat order).
router.get("/:leadId", async (req, res) => {
  const { leadId } = req.params;

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, name, phone, phone_raw, category, pitch_type, status")
    .eq("id", leadId)
    .single();

  if (leadErr) return res.status(404).json({ error: "Lead not found." });

  const { data: messages, error } = await supabase
    .from("inbox_messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ lead, messages: messages || [] });
});

// POST /api/inbox/:leadId/read
// Marks all inbound messages for this lead as read (called when the
// conversation is opened in the UI).
router.post("/:leadId/read", async (req, res) => {
  const { leadId } = req.params;
  const { error } = await supabase
    .from("inbox_messages")
    .update({ is_read: true })
    .eq("lead_id", leadId)
    .eq("direction", "inbound")
    .eq("is_read", false);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// POST /api/inbox/:leadId/reply
// Body: { body }
// Sends a manual, freeform reply from the dashboard (outside the templated
// outreach flow) and records it in the same thread.
router.post("/:leadId/reply", async (req, res) => {
  const { leadId } = req.params;
  const { body } = req.body;

  if (!body || !body.trim()) {
    return res.status(400).json({ error: "Message body is required." });
  }

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, name, phone")
    .eq("id", leadId)
    .single();

  if (leadErr) return res.status(404).json({ error: "Lead not found." });

  let sentMessage;
  try {
    sentMessage = await sendManualReply(lead.phone, body.trim());
  } catch (err) {
    return res.status(503).json({ error: err.message });
  }

  const { data: saved, error: insertErr } = await supabase
    .from("inbox_messages")
    .insert({
      lead_id: lead.id,
      direction: "outbound",
      body: body.trim(),
      whatsapp_message_id: sentMessage?.id?._serialized || null,
    })
    .select()
    .single();

  if (insertErr) return res.status(500).json({ error: insertErr.message });

  logLeadEvent(lead.id, "note", `Manual reply sent: "${body.trim().slice(0, 100)}"`).catch(() => {});

  res.json({ message: saved });
});

export default router;
