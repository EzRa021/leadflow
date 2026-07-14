import { asyncRouter } from "../lib/asyncRouter.js";
import Papa from "papaparse";
import { supabase } from "../db/supabase.js";
import { logLeadEvent, logLeadEventsBulk } from "../lib/events.js";
import { applyLeadsFilters, applyLeadsSort } from "../lib/leadsQuery.js";

const router = asyncRouter();

// GET /api/leads
// Query params: status, pitch_type, search, page, pageSize, dateFrom, dateTo, sortBy, sortDir, category, has_website
router.get("/", async (req, res) => {
  const {
    status,
    pitch_type,
    search,
    page = 1,
    pageSize = 50,
    dateFrom,
    dateTo,
    sortBy = "created_at",
    sortDir = "desc",
    category,
    has_website,
  } = req.query;

  let query = supabase.from("leads").select("*", { count: "exact" });
  query = applyLeadsFilters(query, { status, pitch_type, category, has_website, search, dateFrom, dateTo });

  const from = (Number(page) - 1) * Number(pageSize);
  const to = from + Number(pageSize) - 1;

  query = applyLeadsSort(query, sortBy, sortDir).range(from, to);

  const { data, error, count } = await query;

  if (error) return res.status(500).json({ error: error.message });

  res.json({ data, count, page: Number(page), pageSize: Number(pageSize) });
});

// GET /api/leads/stats
// Summary counts + activity timelines for the dashboard
router.get("/stats", async (req, res) => {
  const { data, error } = await supabase
    .from("leads")
    .select("status, pitch_type, created_at, last_sent_at, send_count");

  if (error) return res.status(500).json({ error: error.message });

  const stats = {
    total: data.length,
    byStatus: {},
    byPitchType: {},
    duplicatesBlocked: 0, // tracked client-side at import time; reserved for future use
  };

  for (const row of data) {
    stats.byStatus[row.status] = (stats.byStatus[row.status] || 0) + 1;
    stats.byPitchType[row.pitch_type] = (stats.byPitchType[row.pitch_type] || 0) + 1;
  }

  // ── Activity timelines (last 14 days) ──
  const days = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
  }

  const leadsByDay = Object.fromEntries(days.map((d) => [d, 0]));
  const sentByDay = Object.fromEntries(days.map((d) => [d, 0]));

  for (const row of data) {
    const createdDay = row.created_at?.slice(0, 10);
    if (createdDay in leadsByDay) leadsByDay[createdDay]++;

    if (row.last_sent_at) {
      const sentDay = row.last_sent_at.slice(0, 10);
      if (sentDay in sentByDay) sentByDay[sentDay]++;
    }
  }

  stats.leadGrowth = days.map((d) => ({ date: d, count: leadsByDay[d] }));
  stats.sendingActivity = days.map((d) => ({ date: d, count: sentByDay[d] }));

  // ── Today / this week ──
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  stats.today = {
    newLeads: data.filter((r) => r.created_at?.slice(0, 10) === todayStr).length,
    sent: data.filter((r) => r.last_sent_at?.slice(0, 10) === todayStr).length,
  };

  stats.thisWeek = {
    newLeads: data.filter((r) => new Date(r.created_at) >= weekAgo).length,
    sent: data.filter((r) => r.last_sent_at && new Date(r.last_sent_at) >= weekAgo).length,
  };

  // ── Success rate ──
  const everSent = data.filter((r) => r.send_count > 0).length;
  const failed = stats.byStatus.failed || 0;
  const skipped = stats.byStatus.skipped || 0;
  const sent = stats.byStatus.sent || 0;

  stats.successRate = {
    sent,
    failed,
    skipped,
    total: sent + failed + skipped,
    rate: sent + failed + skipped > 0 ? Math.round((sent / (sent + failed + skipped)) * 100) : 0,
  };
  stats.everContacted = everSent;

  res.json(stats);
});

// GET /api/leads/analytics
// Category-level and pitch-level breakdowns: which niches reply the most.
// Reply rate = replied / everContacted (leads with send_count > 0) within that group.
router.get("/analytics", async (req, res) => {
  const { data, error } = await supabase
    .from("leads")
    .select("category, pitch_type, status, send_count");

  if (error) return res.status(500).json({ error: error.message });

  function buildBreakdown(groupKey) {
    const groups = {};
    for (const row of data) {
      const key = row[groupKey] || "Uncategorized";
      if (!groups[key]) {
        groups[key] = { key, total: 0, contacted: 0, replied: 0, failed: 0, skipped: 0 };
      }
      const g = groups[key];
      g.total++;
      if (row.send_count > 0) g.contacted++;
      if (row.status === "replied") g.replied++;
      if (row.status === "failed") g.failed++;
      if (row.status === "skipped") g.skipped++;
    }

    return Object.values(groups)
      .map((g) => ({
        ...g,
        replyRate: g.contacted > 0 ? Math.round((g.replied / g.contacted) * 100) : 0,
      }))
      .sort((a, b) => b.replyRate - a.replyRate || b.contacted - a.contacted);
  }

  res.json({
    byCategory: buildBreakdown("category"),
    byPitchType: buildBreakdown("pitch_type"),
  });
});

// GET /api/leads/:id/events
// Chronological activity timeline for the Lead Detail view (imported, sent,
// failed, skipped, status changes, notes) — newest first.
router.get("/:id/events", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("lead_events")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    // Migration 004 may not be applied yet — fail soft with an empty timeline
    // instead of breaking the Lead Detail modal.
    return res.json({ events: [] });
  }
  res.json({ events: data || [] });
});

// GET /api/leads/categories
router.get("/categories", async (req, res) => {
  const { data, error } = await supabase
    .from("leads")
    .select("category");

  if (error) return res.status(500).json({ error: error.message });

  const unique = [...new Set(data.map((r) => r.category).filter(Boolean))].sort();
  res.json({ categories: unique });
});

// GET /api/leads/export
// Query params: same filters as GET /api/leads, but returns ALL matching rows as CSV
router.get("/export", async (req, res) => {
  const { status, pitch_type, search, dateFrom, dateTo, category, has_website } = req.query;

  let query = supabase.from("leads").select("*");
  query = applyLeadsFilters(query, { status, pitch_type, category, has_website, search, dateFrom, dateTo });

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const rows = data.map((r) => ({
    name: r.name,
    phone: r.phone_raw || r.phone,
    category: r.category,
    pitch_type: r.pitch_type,
    city: r.city,
    status: r.status,
    send_count: r.send_count,
    last_sent_at: r.last_sent_at,
    last_error: r.last_error,
    website: r.website,
    maps_url: r.maps_url,
    created_at: r.created_at,
  }));

  const csv = Papa.unparse(rows);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="leadflow-export-${Date.now()}.csv"`);
  res.send(csv);
});

// PATCH /api/leads/:id
// PATCH /api/leads/bulk
// Body: { ids: [uuid, ...], updates: { category?, pitch_type?, status? } }
// Used for bulk category reassignment / status changes from the All Leads page.
// NOTE: this must be registered BEFORE PATCH /:id, or Express will treat
// "bulk" as an :id value and this handler will never be reached.
router.patch("/bulk", async (req, res) => {
  const { ids = [], updates = {} } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: "ids must be a non-empty array." });
  }

  const allowed = ["status", "category", "pitch_type"];
  const safeUpdates = {};
  for (const key of allowed) {
    if (key in updates) safeUpdates[key] = updates[key];
  }

  if (!Object.keys(safeUpdates).length) {
    return res.status(400).json({ error: "No valid fields to update." });
  }

  const { data, error } = await supabase
    .from("leads")
    .update(safeUpdates)
    .in("id", ids)
    .select("id");

  if (error) return res.status(500).json({ error: error.message });

  const summary = Object.entries(safeUpdates).map(([k, v]) => `${k} → ${v}`).join(", ");
  logLeadEventsBulk(ids, "status_changed", `Bulk update: ${summary}`).catch(() => {});

  res.json({ success: true, updatedCount: data?.length ?? 0 });
});

// POST /api/leads/bulk-delete
// Body: { ids: [uuid, ...] }
// Also registered ahead of DELETE /:id for the same reason as above
// (this one is a distinct HTTP method/path shape so it's not strictly
// required to be first, but keeping bulk routes together for clarity).
router.post("/bulk-delete", async (req, res) => {
  const { ids = [] } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: "ids must be a non-empty array." });
  }

  const { error, count } = await supabase
    .from("leads")
    .delete({ count: "exact" })
    .in("id", ids);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, deletedCount: count ?? ids.length });
});

// Update a lead (e.g. mark as replied, edit category)
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const allowed = ["status", "category", "pitch_type", "name", "email", "company"];
  const updates = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: "No valid fields to update." });
  }

  const { data, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const summary = Object.entries(updates).map(([k, v]) => `${k} → ${v}`).join(", ");
  logLeadEvent(id, "status_changed", summary).catch(() => {});

  res.json(data);
});

// DELETE /api/leads/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
