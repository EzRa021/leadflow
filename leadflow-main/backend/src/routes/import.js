import { asyncRouter } from "../lib/asyncRouter.js";
import multer from "multer";
import Papa from "papaparse";
import crypto from "crypto";
import { supabase } from "../db/supabase.js";
import { getPitchType, normalizePhone, normalizeBusinessName } from "../lib/messages.js";
import { logLeadEventsBulk } from "../lib/events.js";

const router = asyncRouter();
const upload = multer({ storage: multer.memoryStorage() });

const previewCache = new Map();
const PREVIEW_TTL_MS = 30 * 60 * 1000;

function cleanupExpiredPreviews() {
  const now = Date.now();
  for (const [key, value] of previewCache.entries()) {
    if (now - value.createdAt > PREVIEW_TTL_MS) previewCache.delete(key);
  }
}

// Fields LeadFlow understands. Values are the default Google-Maps-export
// header names; a `mapping` object (LeadFlow field -> actual CSV header)
// lets users import CSVs from other sources without pre-processing them.
const MAPPABLE_FIELDS = [
  "title", "phone", "email", "company", "categoryName",
  "city", "state", "street", "website", "totalScore", "reviewsCount", "url",
];

function remapRow(row, mapping) {
  if (!mapping || !Object.keys(mapping).length) return row;
  const out = { ...row };
  for (const field of MAPPABLE_FIELDS) {
    const sourceHeader = mapping[field];
    if (sourceHeader && sourceHeader in row) {
      out[field] = row[sourceHeader];
    }
  }
  return out;
}

// GET-able header sniff used by the column-mapping UI: parses just the
// header row so the frontend can offer a mapper when the file doesn't use
// the default Google Maps export column names.
function sniffHeaders(buffer) {
  const text = buffer.toString("utf-8");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, preview: 1 });
  return parsed.meta?.fields || [];
}

function parseCsvRows(buffer, originalName, mapping = null) {
  const text = buffer.toString("utf-8");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

  if (parsed.errors.length) {
    const err = new Error("Could not parse CSV");
    err.details = parsed.errors.slice(0, 5);
    throw err;
  }

  const rows = mapping ? parsed.data.map((r) => remapRow(r, mapping)) : parsed.data;
  const candidates = [];
  // Rows that failed validation, kept with the reason so the user can
  // download a report, fix the source data, and re-import instead of
  // silently losing rows (Tier 2 roadmap item #8).
  const rejected = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing
    const phoneRaw = row.phone?.trim();

    if (!phoneRaw) {
      rejected.push({ rowNumber, name: row.title?.trim() || "", phone: "", reason: "Missing phone number" });
      return;
    }

    const normalized = normalizePhone(phoneRaw);
    if (!normalized) {
      rejected.push({ rowNumber, name: row.title?.trim() || "", phone: phoneRaw, reason: "Phone number could not be parsed" });
      return;
    }

    const businessName = row.title?.trim() || "Unknown business";
    candidates.push({
      name: businessName,
      normalized_name: normalizeBusinessName(businessName),
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
  });

  return { totalRows: rows.length, candidates, rejected };
}

// Fuzzy duplicate check by normalized business name — catches leads
// scraped twice under slightly different formatting even when the
// phone number wasn't recognized as an exact match. Bounded to a
// sane row count so it stays cheap; skipped gracefully past that.
const FUZZY_NAME_CHECK_MAX_ROWS = 20000;

async function buildExistingNameIndex() {
  const { count } = await supabase.from("leads").select("id", { count: "exact", head: true });
  if (!count || count > FUZZY_NAME_CHECK_MAX_ROWS) return null;

  const { data, error } = await supabase.from("leads").select("id, name, phone");
  if (error || !data) return null;

  const index = new Map(); // normalizedName -> [{id, name, phone}]
  for (const row of data) {
    const key = normalizeBusinessName(row.name);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ id: row.id, name: row.name, phone: row.phone });
  }
  return index;
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

// POST /api/leads/import/headers
// Lightweight header-only sniff so the frontend can show a column-mapping UI
// when a CSV doesn't use the default Google Maps export column names
// (Tier 3 #11) — no caching, no row parsing, just the header list.
router.post("/import/headers", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded. Send a CSV under field 'file'." });
  }
  let headers;
  try {
    headers = sniffHeaders(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: "Could not read CSV headers" });
  }
  const hasStandardColumns = headers.includes("phone");
  res.json({ headers, mappableFields: MAPPABLE_FIELDS, hasStandardColumns });
});

// POST /api/leads/import/preview
// Optional multipart field `mapping` — JSON string mapping LeadFlow field
// names (see MAPPABLE_FIELDS) to actual CSV header names, for CSVs that
// don't use the default Google Maps export column names.
router.post("/import/preview", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded. Send a CSV under field 'file'." });
  }

  let mapping = null;
  if (req.body?.mapping) {
    try {
      mapping = JSON.parse(req.body.mapping);
    } catch {
      return res.status(400).json({ error: "mapping must be valid JSON." });
    }
  }

  let totalRows, candidates, rejected;
  try {
    ({ totalRows, candidates, rejected } = parseCsvRows(req.file.buffer, req.file.originalname, mapping));
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

  // Fuzzy in-file check: same normalized name, different phone number.
  // Flagged as a warning rather than dropped — could legitimately be two
  // branches/lines of the same business.
  const seenNamesInFile = new Map(); // normalizedName -> phone of first occurrence
  for (const c of deduped) {
    if (!c.normalized_name) continue;
    const firstPhone = seenNamesInFile.get(c.normalized_name);
    if (firstPhone && firstPhone !== c.phone) {
      c.possibleDuplicate = { reason: "similar_name_in_file", matchedPhone: firstPhone };
    } else if (!firstPhone) {
      seenNamesInFile.set(c.normalized_name, c.phone);
    }
  }

  // Chunked DB check — accurate for any list size
  const phones = deduped.map((c) => c.phone);
  let existingMap;
  try {
    existingMap = await checkPhonesInDb(phones);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  // Fuzzy DB check by normalized name — only for phones that didn't already
  // match exactly, so we're not double-flagging genuine exact matches.
  let existingNameIndex = null;
  try {
    existingNameIndex = await buildExistingNameIndex();
  } catch {
    existingNameIndex = null;
  }

  const rowsOut = deduped.map((c) => {
    const existingLead = existingMap.get(c.phone);
    let matchType = "new";
    if (existingLead) {
      matchType = existingLead.send_count > 0 ? "contacted" : "existing";
    }

    let possibleDuplicate = c.possibleDuplicate || null;
    if (!possibleDuplicate && matchType === "new" && existingNameIndex && c.normalized_name) {
      const matches = existingNameIndex.get(c.normalized_name);
      const diffPhoneMatch = matches?.find((m) => m.phone !== c.phone);
      if (diffPhoneMatch) {
        possibleDuplicate = {
          reason: "similar_name_in_db",
          matchedPhone: diffPhoneMatch.phone,
          matchedName: diffPhoneMatch.name,
        };
      }
    }

    return {
      ...c,
      matchType,
      possibleDuplicate,
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
    possibleDuplicates: rowsOut.filter((r) => r.possibleDuplicate).length,
  };

  cleanupExpiredPreviews();
  const batchId = crypto.randomUUID();
  previewCache.set(batchId, {
    rows: rowsOut,
    rejected,
    createdAt: Date.now(),
    filename: req.file.originalname,
  });

  res.json({
    batchId,
    totalRows,
    parsedWithPhone: candidates.length,
    duplicatesWithinFile,
    rejectedCount: rejected.length,
    counts,
    rows: rowsOut,
  });
});

// GET /api/leads/import/:batchId/rejected.csv
// Downloadable report of rows that failed validation during this preview
// (missing/unparseable phone numbers) — lets the user fix the source data
// and re-import instead of silently losing rows.
router.get("/import/:batchId/rejected.csv", (req, res) => {
  const cached = previewCache.get(req.params.batchId);
  if (!cached) {
    return res.status(404).json({ error: "This import batch has expired. Please re-upload the CSV." });
  }

  const rows = cached.rejected || [];
  const csv = Papa.unparse({
    fields: ["rowNumber", "name", "phone", "reason"],
    data: rows.map((r) => [r.rowNumber, r.name, r.phone, r.reason]),
  });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="rejected-rows-${req.params.batchId}.csv"`,
  );
  res.send(csv);
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
        const { error: requeueErr } = await supabase
          .from("leads")
          .update({ status: "pending" })
          .in("phone", chunk);
        // Don't silently report success if the re-queue write failed — the
        // whole point of mode:"all" is to reset these leads to pending.
        if (requeueErr) {
          return res.status(500).json({
            error: `Failed to reset existing leads to pending: ${requeueErr.message}`,
          });
        }
      }
    }
  } else {
    rowsToInsert = cached.rows.filter((r) => r.matchType === "new");
  }

  const importBatchId = crypto.randomUUID();

  const toInsert = rowsToInsert.map(({ matchType, existing, possibleDuplicate, normalized_name, ...rest }) => ({
    ...rest,
    import_batch_id: importBatchId,
  }));

  let inserted = [];
  if (toInsert.length) {
    const { data, error } = await supabase.from("leads").insert(toInsert).select();
    if (error) return res.status(500).json({ error: error.message });
    inserted = data;
    logLeadEventsBulk(inserted.map((l) => l.id), "imported", `Imported from ${cached.filename || "CSV"}`).catch(() => {});
  }

  const skipped = cached.rows.length - rowsToInsert.length -
    (mode === "all" ? cached.rows.filter((r) => r.matchType === "existing" || r.matchType === "contacted").length : 0);

  // Leads already messaged before — offer resend
  const contactedRows = cached.rows.filter((r) => r.matchType === "contacted");
  let contactedLeads = [];

  if (contactedRows.length && mode !== "all") {
    // Single chunked re-fetch with id included — a prior revision of this
    // computed a throwaway pass via checkPhonesInDb() first and immediately
    // discarded it; that extra round trip served no purpose since it
    // lacked `id` and this fetch was always needed anyway.
    const phonesArr = contactedRows.map((r) => r.phone);
    const CHUNK = 500;
    const allContacted = [];
    for (let i = 0; i < phonesArr.length; i += CHUNK) {
      const { data, error: contactedErr } = await supabase
        .from("leads")
        .select("id, name, phone, send_count, last_sent_at")
        .in("phone", phonesArr.slice(i, i + CHUNK));
      // A failed chunk here would silently under-report the contacted leads
      // available for resend, so log it rather than swallowing it entirely.
      if (contactedErr) {
        console.error("[import] contacted-leads lookup failed:", contactedErr.message);
      }
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
