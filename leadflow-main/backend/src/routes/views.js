import { asyncRouter } from "../lib/asyncRouter.js";
import { supabase } from "../db/supabase.js";

const router = asyncRouter();

// Fields that are meaningful to persist in a saved view — mirrors the
// filter params accepted by GET /api/leads / GET /api/leads/export.
// Anything else in the payload is dropped rather than trusted verbatim.
const FILTER_KEYS = [
  "status",
  "pitch_type",
  "category",
  "has_website",
  "search",
  "dateFrom",
  "dateTo",
  "sortBy",
  "sortDir",
];

function sanitizeFilters(input = {}) {
  const out = {};
  for (const key of FILTER_KEYS) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== "") {
      out[key] = String(input[key]);
    }
  }
  return out;
}

// GET /api/views
// Pinned views first, then most recently created.
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("user_views")
    .select("*")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ views: data || [] });
});

// POST /api/views
// Body: { name, filters, isPinned? }
router.post("/", async (req, res) => {
  const { name, filters, isPinned = false } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "A name is required for the saved view." });
  }
  if (!filters || typeof filters !== "object") {
    return res.status(400).json({ error: "filters must be an object." });
  }

  const clean = sanitizeFilters(filters);
  if (!Object.keys(clean).length) {
    return res.status(400).json({ error: "At least one active filter is required to save a view." });
  }

  const { data, error } = await supabase
    .from("user_views")
    .insert({ name: name.trim(), filters: clean, is_pinned: !!isPinned })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ view: data });
});

// PATCH /api/views/:id
// Body: { name?, isPinned? } — rename or pin/unpin. Filters are immutable by
// design; delete + re-save if the underlying filter combo needs to change.
router.patch("/:id", async (req, res) => {
  const { name, isPinned } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (isPinned !== undefined) updates.is_pinned = !!isPinned;

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: "Nothing to update." });
  }

  const { data, error } = await supabase
    .from("user_views")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ view: data });
});

// DELETE /api/views/:id
router.delete("/:id", async (req, res) => {
  const { error } = await supabase.from("user_views").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
