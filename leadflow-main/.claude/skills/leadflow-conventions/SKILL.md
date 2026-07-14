---
name: leadflow-conventions
description: Use when working on LeadFlow's import flow, send flow, database schema/migrations, filter/sort logic, or WhatsApp client state. Covers non-obvious gotchas (persisted job cursors, in-memory caches, the mode:"all" reset behavior, 409 confirm gate) that are easy to get wrong by assuming naive behavior.
---

# LeadFlow conventions & gotchas

## Database (Supabase/Postgres)

**Migrations — run in order:**
1. `schema.sql` — leads, send_log
2. `002_templates_and_tracking.sql` — templates table, extra lead columns
3. `003_send_jobs.sql` — send_jobs table, website/category/country indexes (includes the
   partial index `idx_leads_website_isnull` — this is where the planned "006 index tuning"
   migration actually landed; there is no file numbered 006, don't create one without checking
   `backend/db/` first)
4. `004_lead_events.sql` — activity timeline
5. `005_saved_views.sql` — saved filter presets
6. `007_inbox_messages.sql` — WhatsApp reply threads

**Key tables:**
- `leads` — UNIQUE on `phone` (normalized `234XXXXXXXXXX`). `status`: pending|sent|failed|skipped|replied.
- `templates` — unique-default-per-`pitch_type` (POS|WEBSITE|GENERIC) enforced by index.
- `send_log` — one row per send attempt, FK to `leads.id`.

## Import flow (two-step, no writes until confirm)
1. `POST /api/leads/import/preview` — parses CSV, normalizes phones, dedupes, tags each row
   `new` | `existing` | `contacted`. Cached in-memory (`previewCache` in `import.js`), 30min TTL,
   genuinely lost on restart.
2. `POST /api/leads/import/confirm` — `{ batchId, mode }`.
   - `new_only` / `selected`: inserts only `new` rows.
   - `all`: inserts new rows **and** runs `UPDATE leads SET status='pending' WHERE phone IN (...)`
     for any `existing`/`contacted` phone in this batch — a real re-queue, not just a UI label.

## Send flow (async job, persisted)
1. `POST /api/send` validates WhatsApp readiness, resolves template (explicit `templateId` or
   per-lead `pitch_type` default), creates a `send_jobs` row, returns `jobId` immediately.
2. Background loop: `client.isRegisteredUser()` → `client.sendMessage()` → update `leads` +
   insert `send_log` → sleep `SEND_DELAY_MS` (default 8000ms).
3. **`send_jobs` table is the source of truth**, not memory — `runJob()` reads/writes it per lead.
   Only the `activeJobs` Map of cancel functions is memory-only (for instant Stop). On restart,
   `resumeIncompleteJobs()` picks jobs back up from their persisted cursor.
4. `send_count` increment is manual arithmetic (`lead.send_count + 1`), not a DB-level atomic
   increment — concurrent requests for the same lead can race.
5. `confirmResend: false` isn't a hard gate — if already-sent leads are included, the backend
   returns 409 `{ requiresConfirmation: true }`. Frontend must retry with `confirmResend: true`.

## Filter/sort consistency
Frontend and backend must use identical filter/sort logic or list views and send jobs will
silently diverge (this happened once — `dateFrom`/`dateTo` were being ignored in send jobs
because `send.js` had its own copy of the query-building logic). Shared filter/sort logic
lives in a `leadsQuery.js` module — `leads.js` and `send.js` both import from it. Any new
filter/sort field must be added there, not duplicated in either route file.

## Frontend data layer
- `frontend/src/lib/queryConfig.js` — `STALE_TIME.leads` (30s), `STALE_TIME.categories` (5min).
  Global default elsewhere is 10s.
- Paginated leads queries use `placeholderData: keepPreviousData` (TanStack Query v5) to avoid
  flashing empty on page/filter change.
- `AllLeadsPage` delete/bulk-delete mutations are optimistic (`onMutate` snapshot + rollback on
  error); `bulkCategoryMutation` is invalidate-only, intentionally not optimistic.
- `frontend/src/store/` has two Zustand stores (`replyInboxStore.js`, `savedViewsStore.js`) that
  are scaffolded but **not wired up** — inbox and saved-views UI use TanStack Query directly
  against the backend instead. Don't assume these stores are live state.

## Other gotchas
- No auth on any endpoint — personal tool only, never expose the backend publicly as-is.
- Default template can't be deleted (`DELETE /api/templates/:id` → 400 if `is_default`); caller
  must reassign default first.
- `pitch_type` classification (`getPitchType()` in `messages.js`) runs at import time via
  category keyword matching — POS/WEBSITE/GENERIC — and determines default template selection.
