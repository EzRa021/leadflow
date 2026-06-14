import { Router } from "express";
import { supabase } from "../db/supabase.js";
import { renderTemplate } from "../lib/messages.js";

const router = Router();

// GET /api/templates
// Optional query: pitch_type
router.get("/", async (req, res) => {
  const { pitch_type } = req.query;

  let query = supabase.from("templates").select("*").order("pitch_type").order("created_at");
  if (pitch_type) query = query.eq("pitch_type", pitch_type);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ data });
});

// POST /api/templates
// Body: { name, pitch_type, body, is_default? }
router.post("/", async (req, res) => {
  const { name, pitch_type, body, is_default = false } = req.body;

  if (!name?.trim() || !body?.trim()) {
    return res.status(400).json({ error: "name and body are required." });
  }

  const validTypes = ["POS", "WEBSITE", "GENERIC", "CUSTOM"];
  const type = validTypes.includes(pitch_type) ? pitch_type : "CUSTOM";

  // If setting as default, unset previous default for this pitch_type first
  if (is_default) {
    await supabase.from("templates").update({ is_default: false }).eq("pitch_type", type);
  }

  const { data, error } = await supabase
    .from("templates")
    .insert({ name: name.trim(), pitch_type: type, body, is_default })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// POST /api/templates/:id/duplicate
router.post("/:id/duplicate", async (req, res) => {
  const { id } = req.params;

  const { data: original, error: fetchErr } = await supabase
    .from("templates")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr) return res.status(404).json({ error: "Template not found." });

  const { data, error } = await supabase
    .from("templates")
    .insert({
      name: `${original.name} (copy)`,
      pitch_type: original.pitch_type,
      body: original.body,
      is_default: false,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/templates/:id
// Body: any of { name, pitch_type, body, is_default }
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const allowed = ["name", "pitch_type", "body", "is_default"];
  const updates = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: "No valid fields to update." });
  }

  // If setting as default, unset previous default for this pitch_type first
  if (updates.is_default === true) {
    const pitchType =
      updates.pitch_type ||
      (await supabase.from("templates").select("pitch_type").eq("id", id).single()).data?.pitch_type;

    if (pitchType) {
      await supabase.from("templates").update({ is_default: false }).eq("pitch_type", pitchType);
    }
  }

  const { data, error } = await supabase
    .from("templates")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/templates/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const { data: template } = await supabase.from("templates").select("is_default").eq("id", id).single();

  if (template?.is_default) {
    return res.status(400).json({
      error: "Can't delete the default template for this pitch type. Set another template as default first.",
    });
  }

  const { error } = await supabase.from("templates").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// POST /api/templates/preview
// Body: { body, lead: { name, company, email, phone, phone_raw } }
// Returns the rendered message with variables substituted
router.post("/preview", (req, res) => {
  const { body, lead = {} } = req.body;
  if (!body?.trim()) {
    return res.status(400).json({ error: "body is required." });
  }
  res.json({ rendered: renderTemplate(body, lead) });
});

export default router;
