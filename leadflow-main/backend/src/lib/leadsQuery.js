// Shared filter/sort builder for the leads table.
// Used by both GET /api/leads (and /export) and POST /api/send (range mode)
// so that a "Send All" / range send always operates on exactly the same
// rows the user was looking at when they triggered it. If you add a new
// filter to one call site, add it here so both stay in sync — this file
// existing at all is the fix for the range-mismatch bug described in
// CLAUDE.md; don't let the two routes diverge again by duplicating this
// logic locally in either route file.

const SORTABLE_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "name",
  "category",
  "pitch_type",
  "status",
  "city",
  "state",
  "total_score",
  "reviews_count",
  "last_sent_at",
  "send_count",
]);

/**
 * Applies status/pitch_type/category/has_website/search/date-range filters
 * to a Supabase query builder. Mirrors the same filter shape used by both
 * GET /api/leads and POST /api/send (range mode).
 */
export function applyLeadsFilters(query, filters = {}) {
  const {
    status,
    pitch_type,
    category,
    has_website,
    search,
    dateFrom,
    dateTo,
  } = filters;

  if (status) {
    query = query.eq("status", status);
  }

  if (pitch_type) {
    query = query.eq("pitch_type", pitch_type);
  }

  if (category) {
    query = query.eq("category", category);
  }

  // has_website is a tri-state query param coming in as a string ("true"/"false")
  // or boolean. true  -> website is a non-empty string
  // false -> website is null or empty string
  if (has_website === true || has_website === "true") {
    query = query.not("website", "is", null).neq("website", "");
  } else if (has_website === false || has_website === "false") {
    query = query.or("website.is.null,website.eq.");
  }

  if (search) {
    const escaped = search.replace(/[%_]/g, (c) => `\\${c}`);
    query = query.or(
      `name.ilike.%${escaped}%,phone.ilike.%${escaped}%,category.ilike.%${escaped}%,city.ilike.%${escaped}%`,
    );
  }

  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }

  if (dateTo) {
    query = query.lte("created_at", dateTo);
  }

  return query;
}

/**
 * Applies sort to a Supabase query builder, whitelisting sortBy against
 * actual leads columns to avoid passing arbitrary/unsafe values through.
 * Falls back to created_at desc for anything not on the whitelist.
 */
export function applyLeadsSort(query, sortBy, sortDir) {
  const column = SORTABLE_COLUMNS.has(sortBy) ? sortBy : "created_at";
  const ascending = String(sortDir).toLowerCase() === "asc";
  return query.order(column, { ascending });
}
