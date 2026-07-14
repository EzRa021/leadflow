// Lightweight helper for writing to the lead_events activity timeline.
// Failures here are logged but never thrown — recording history should
// never break the primary action (import, send, edit) that triggered it.
import { supabase } from "../db/supabase.js";

export async function logLeadEvent(leadId, eventType, detail = null, metadata = {}) {
  if (!leadId) return;
  const { error } = await supabase.from("lead_events").insert({
    lead_id: leadId,
    event_type: eventType,
    detail,
    metadata,
  });
  if (error) {
    // Table may not exist yet if migration 004 hasn't been run — degrade gracefully.
    console.error(`[lead_events] failed to log "${eventType}" for lead ${leadId}:`, error.message);
  }
}

export async function logLeadEventsBulk(leadIds = [], eventType, detail = null, metadata = {}) {
  if (!leadIds.length) return;
  const rows = leadIds.map((lead_id) => ({ lead_id, event_type: eventType, detail, metadata }));
  const { error } = await supabase.from("lead_events").insert(rows);
  if (error) {
    console.error(`[lead_events] failed to bulk log "${eventType}":`, error.message);
  }
}
