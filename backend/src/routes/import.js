import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import crypto from "crypto";
import { supabase } from "../db/supabase.js";
import { getPitchType, normalizePhone } from "../lib/messages.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const previewCache = new Map();
const PREVIEW_TTL_MS = 30 * 60 * 1000;

function cleanupExpiredPreviews() {
  const now = Date.now();
  for (const [key, value] of previewCache.entries()) {
    if (now - value.createdAt > PREVIEW_TTL_MS) previewCache.delete(key);
  }
}

function parseCsvRows(buffer, originalName) {
  const text = buffer.toString("utf-8");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

  if (parsed.errors.length) {
    const err = new Error("Could not parse CSV");
    err.details = parsed.errors.slice(0, 5);
    throw err;
  }

  const rows = parsed.data;
  const candidates = [];

  for (const row of rows) {
    const phoneRaw = row.phone?.trim();
    const normalized = normalizePhone(phoneRaw);
    if (!normalized) continue;

    candidates.push({
      name: row.title?.trim() || "Unknown business",
      phone: normalized,
      phone_raw: phoneRaw,
      email: row.email?.trim() || null,
      company: row.company?.trim() || row.title?.trim() || null,
      category: row.categoryName?.trim() || null,
      pitch_type: getPitchType(row.categoryName),
      city: row.city?.trim() || null,
      state: row.state?.trim() || null,
      street: row.street?.trim() || null,
      website: row.website?.trim() || null,
      total_score: row.totalScore ? Number(row.totalScore) : null,
      reviews_count: row.reviewsCount ? Number(row.reviewsCount) : null,
      maps_url: row.url?.trim() || null,
      source_csv: originalName,
    });
  }

  return { totalRows: rows.length, candidates };
}

// Chunked DB phone lookup — handles 20k+ leads accurately.
// Supabase .in() has a practical limit around 1000 values per query.
// We chunk the phone list and run parallel queries then merge results.
async function checkPhonesInDb(phones) {
  const CHUNK_SIZE = 500;
  const chunks = [];
  for (let i = 0; i < phones.length; i += CHUNK_SIZE) {
    chunks.push(phones.slice(i, i + CHUNK_SIZE));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("leads")
        .select("phone, status, last_sent_at, send_count")
        .in("phone", chunk)
    )
  );

  const existingMap = new Map();
  for (const { data, error } of results) {
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      existingMap.set(row.phone, row);
    }
  }

  return existingMap;
}

// POST /api/leads/import/preview
router.post("/import/preview", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded. Send a CSV under field 'file'." });
  }

  let totalRows, candidates;
  try {
    ({ totalRows, candidates } = parseCsvRows(req.file.buffer, req.file.originalname));
  } catch (err) {
    return res.status(400).json({ error: err.message, details: err.details });
  }

  if (!candidates.length) {
    return res.status(400).json({
      error: "No rows with usable phone numbers were found in this CSV.",
    });
  }

  // Dedupe within the file itself, keep first occurrence
  const seenInFile = new Set();
  const deduped = [];
  let duplicatesWithinFile = 0;

  for (const c of candidates) {
    if (seenInFile.has(c.phone)) {
      duplicatesWithinFile++;
      continue;
    }
    seenInFile.add(c.phone);
    deduped.push(c);
  }

  // Chunked DB check — accurate for any list size
  const phones = deduped.map((c) => c.phone);
  let existingMap;
  try {
    existingMap = await checkPhonesInDb(phones);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const rowsOut = deduped.map((c) => {
    const existingLead = existingMap.get(c.phone);
    let matchType = "new";
    if (existingLead) {
      matchType = existingLead.send_count > 0 ? "contacted" : "existing";
    }
    return {
      ...c,
      matchType,
      existing: existingLead
        ? {
            status: existingLead.status,
            sendCount: existingLead.send_count,
            lastSentAt: existingLead.last_sent_at,
          }
        : null,
    };
  });

  const counts = {
    total: rowsOut.length,
    new: rowsOut.filter((r) => r.matchType === "new").length,
    existing: rowsOut.filter((r) => r.matchType === "existing").length,
    contacted: rowsOut.filter((r) => r.matchType === "contacted").length,
  };

  cleanupExpiredPreviews();
  const batchId = crypto.randomUUID();
  previewCache.set(batchId, { rows: rowsOut, createdAt: Date.now(), filename: req.file.originalname });

  res.json({
    batchId,
    totalRows,
    parsedWithPhone: candidates.length,
    duplicatesWithinFile,
    counts,
    rows: rowsOut,
  });
});

// POST /api/leads/import/confirm
// mode: "new_only" | "all" | "selected"
// For "all": inserts new leads AND updates existing ones (re-imports them to pending).
// For "new_only": only inserts genuinely new phones.
// For "selected": only inserts phones in leadKeys that are matchType "new".
router.post("/import/confirm", async (req, res) => {
  const { batchId, mode = "new_only", leadKeys = [] } = req.body;

  const cached = previewCache.get(batchId);
  if (!cached) {
    return res.status(404).json({ error: "This import batch has expired. Please re-upload the CSV." });
  }

  let rowsToInsert;
  if (mode === "selected") {
    const keySet = new Set(leadKeys);
    rowsToInsert = cached.rows.filter((r) => r.matchType === "new" && keySet.has(r.phone));
  } else if (mode === "all") {
    // Insert new leads; for existing/contacted leads, reset them to pending so they can be re-sent
    rowsToInsert = cached.rows.filter((r) => r.matchType === "new");
    // Update existing leads back to pending
    const existingPhones = cached.rows
      .filter((r) => r.matchType === "existing" || r.matchType === "contacted")
      .map((r) => r.phone);

    if (existingPhones.length > 0) {
      // Chunk updates too
      const CHUNK = 500;
      for (let i = 0; i < existingPhones.length; i += CHUNK) {
        const chunk = existingPhones.slice(i, i + CHUNK);
        await supabase
          .from("leads")
          .update({ status: "pending" })
          .in("phone", chunk);
      }
    }
  } else {
    rowsToInsert = cached.rows.filter((r) => r.matchType === "new");
  }

  const importBatchId = crypto.randomUUID();

  const toInsert = rowsToInsert.map(({ matchType, existing, ...rest }) => ({
    ...rest,
    import_batch_id: importBatchId,
  }));

  let inserted = [];
  if (toInsert.length) {
    const { data, error } = await supabase.from("leads").insert(toInsert).select();
    if (error) return res.status(500).json({ error: error.message });
    inserted = data;
  }

  const skipped = cached.rows.length - rowsToInsert.length -
    (mode === "all" ? cached.rows.filter((r) => r.matchType === "existing" || r.matchType === "contacted").length : 0);

  // Leads already messaged before — offer resend
  const contactedRows = cached.rows.filter((r) => r.matchType === "contacted");
  let contactedLeads = [];

  if (contactedRows.length && mode !== "all") {
    const phones = contactedRows.map((r) => r.phone);
    let contactedMap;
    try {
      contactedMap = await checkPhonesInDb(phones);
    } catch (e) {
      contactedMap = new Map();
    }
    contactedLeads = [...contactedMap.values()].map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      sendCount: l.send_count,
      lastSentAt: l.last_sent_at,
    }));

    // Re-fetch with id included
    const phonesArr = contactedRows.map((r) => r.phone);
    const CHUNK = 500;
    const allContacted = [];
    for (let i = 0; i < phonesArr.length; i += CHUNK) {
      const { data } = await supabase
        .from("leads")
        .select("id, name, phone, send_count, last_sent_at")
        .in("phone", phonesArr.slice(i, i + CHUNK));
      if (data) allContacted.push(...data);
    }
    contactedLeads = allContacted.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      sendCount: l.send_count,
      lastSentAt: l.last_sent_at,
    }));
  }

  previewCache.delete(batchId);

  res.json({
    importBatchId,
    insertedCount: inserted.length,
    skippedCount: Math.max(0, skipped),
    inserted,
    contactedLeads,
  });
});

export default router;
