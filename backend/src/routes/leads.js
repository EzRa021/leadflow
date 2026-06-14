import { Router } from "express";
import Papa from "papaparse";
import { supabase } from "../db/supabase.js";

const router = Router();

// GET /api/leads
// Query params: status, pitch_type, search, page, pageSize, dateFrom, dateTo, sortBy, sortDir
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
  } = req.query;

  let query = supabase.from("leads").select("*", { count: "exact" });

  if (status) query = query.eq("status", status);
  if (pitch_type) query = query.eq("pitch_type", pitch_type);
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,category.ilike.%${search}%`);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo);

  const allowedSort = ["created_at", "name", "status", "pitch_type", "last_sent_at", "send_count"];
  const sortColumn = allowedSort.includes(sortBy) ? sortBy : "created_at";

  const from = (Number(page) - 1) * Number(pageSize);
  const to = from + Number(pageSize) - 1;

  query = query.order(sortColumn, { ascending: sortDir === "asc" }).range(from, to);

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

// GET /api/leads/export
// Query params: same filters as GET /api/leads, but returns ALL matching rows as CSV
router.get("/export", async (req, res) => {
  const { status, pitch_type, search, dateFrom, dateTo } = req.query;

  let query = supabase.from("leads").select("*");

  if (status) query = query.eq("status", status);
  if (pitch_type) query = query.eq("pitch_type", pitch_type);
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,category.ilike.%${search}%`);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo);

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
