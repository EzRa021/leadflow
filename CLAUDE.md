# CLAUDE.md — LeadFlow

## What this project is

LeadFlow is a personal outreach tool built for Ezra Dev Studio. It takes Google Maps CSV exports,
deduplicates and classifies the leads, and sends personalized WhatsApp messages via whatsapp-web.js.
The core problem it solves: never accidentally re-message a lead that already got contacted.

---

## Architecture

```
frontend/          React + Vite (deploy to Vercel)
  src/
    pages/         One file per route
    components/    UI components (shadcn + custom)
    lib/
      api.js       All HTTP calls go through here — single source of truth
      format.js    Date/number formatters
      toast.jsx    Toaster wiring

backend/           Node + Express (must run persistently — Railway, Render, or local PC)
  src/
    index.js       Entry point, route mounting, error handler
    routes/
      leads.js     CRUD, filtering, stats, CSV export
      import.js    Two-step import: preview → confirm (in-memory cache, 30min TTL)
      send.js      WhatsApp send queue, in-memory job tracker
      templates.js Template CRUD + live preview render
      whatsapp.js  Connect / status poll / logout
    whatsapp/
      client.js    Singleton WhatsApp client manager (Puppeteer + whatsapp-web.js)
    lib/
      messages.js  getPitchType(), normalizePhone(), renderTemplate(), toWhatsAppId()
    db/
      supabase.js  createClient() singleton — reads SUPABASE_URL + SUPABASE_SERVICE_KEY
  db/
    schema.sql               Initial schema (leads, send_log)
    002_templates_and_tracking.sql  Migration: templates table, extra lead columns, seed data
```

**Why the backend can't be serverless:** `whatsapp-web.js` runs a persistent Puppeteer/Chrome
process with a logged-in WhatsApp session stored under `.wwebjs_auth/`. Serverless runtimes kill
processes between requests. The backend must stay alive.

---

## Database — Supabase (Postgres)

**Tables:**

`leads`
- `id` uuid PK
- `name`, `phone` (normalized to `234XXXXXXXXXX`), `phone_raw`, `category`, `pitch_type` (POS | WEBSITE | GENERIC)
- `city`, `state`, `street`, `website`, `total_score`, `reviews_count`, `maps_url`
- `email`, `company`, `import_batch_id`, `imported_at`
- `status` (pending | sent | failed | skipped | replied), `send_count`, `last_sent_at`, `last_message`, `last_error`
- `source_csv`, `created_at`, `updated_at`
- UNIQUE on `phone` — this is the deduplication key

`templates`
- `id`, `name`, `pitch_type`, `body` (supports `{{name}}`, `{{company}}`, `{{email}}`, `{{phone}}`)
- `is_default` — unique index ensures only one default per pitch_type
- Seeded with three defaults: POS, WEBSITE, GENERIC

`send_log`
- One row per send attempt; references `leads.id`
- `status` (sent | failed | skipped), `message`, `note`, `template_id`, `template_name`

**Run schema in order:**
1. `backend/db/schema.sql`
2. `backend/db/002_templates_and_tracking.sql`

---

## Environment variables

**Backend (`backend/.env`):**
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
FRONTEND_ORIGIN=http://localhost:5173   # or Vercel URL in prod
PORT=4000
SEND_DELAY_MS=8000                      # delay between WhatsApp messages (default 8s)
```

**Frontend (`frontend/.env.local`):**
```
VITE_API_URL=http://localhost:4000      # or backend URL in prod
```

---

## Running locally

```bash
# Backend
cd backend
pnpm install
pnpm dev          # node --watch src/index.js

# Frontend (separate terminal)
cd frontend
pnpm install
pnpm dev          # vite on :5173
```

Backend runs on `:4000`, frontend on `:5173`. Both use pnpm.

---

## Key flows to understand

### Import flow (two-step, no DB writes until confirm)
1. `POST /api/leads/import/preview` — accepts multipart CSV, parses it with PapaParse, normalizes
   phones, dedupes within the file, checks existing DB phones, returns a `batchId` + preview rows
   with `matchType` (new | existing | contacted). Data cached in-memory for 30 minutes.
2. `POST /api/leads/import/confirm` — takes `batchId` + `mode` (new_only | all | selected).
   Only inserts rows with `matchType === "new"` — existing phone unique constraint would reject
   the rest anyway. Clears the cache entry after insert.

### Send flow (async job, frontend polls)
1. `POST /api/send` — validates WhatsApp is ready, resolves templates (explicit templateId or
   per-lead pitch_type default), creates in-memory job, responds immediately with `jobId`.
2. Background async loop iterates leads, calls `client.isRegisteredUser()` then `client.sendMessage()`,
   updates `leads` row and inserts `send_log` row, sleeps `SEND_DELAY_MS` between each.
3. Frontend polls `GET /api/send/jobs/:jobId` for progress (sent / failed / skipped counts + log).
4. If any leads already have `send_count > 0` and `confirmResend` is false, returns 409 asking
   for confirmation before proceeding.

### Template rendering
`renderTemplate(body, lead)` in `src/lib/messages.js` does a simple regex replace of
`{{name}}`, `{{company}}`, `{{email}}`, `{{phone}}` with lead values. Falls back gracefully —
`name` defaults to "there", missing fields are empty string.

### Pitch type classification
`getPitchType(categoryName)` checks the category against keyword lists:
- POS: pharmacy, supermarket, minimart, provision, boutique, electronics, hardware, retail, etc.
- WEBSITE: restaurant, fast food, hotel, guest house, lodge, cafe, bar, etc.
- GENERIC: everything else

This runs at import time and determines which default template is used when sending.

### Phone normalization
`normalizePhone()` in `src/lib/messages.js`:
- Strips non-digits
- `0XXXXXXXXXX` → `234XXXXXXXXXX`
- `234XXXXXXXXXX` → kept as-is
- 10-digit number → `234` + digits
- WhatsApp ID format: `${normalizedPhone}@c.us`

---

## API routes reference

```
GET  /api/health

GET  /api/leads            ?status, pitch_type, search, page, pageSize, dateFrom, dateTo, sortBy, sortDir
GET  /api/leads/stats      Dashboard counts + 14-day timelines
GET  /api/leads/export     Same filters, returns CSV download
PATCH /api/leads/:id       Update status, category, pitch_type, name, email, company
DELETE /api/leads/:id

POST /api/leads/import/preview    multipart file
POST /api/leads/import/confirm    { batchId, mode, leadKeys? }

GET  /api/whatsapp/status
POST /api/whatsapp/connect
POST /api/whatsapp/logout

POST /api/send/check       { leadIds } → returns alreadySent breakdown
POST /api/send             { leadIds, confirmResend?, templateId? } → { jobId, total, estimatedSeconds }
GET  /api/send/jobs/:jobId  Poll for progress

GET  /api/templates        ?pitch_type
POST /api/templates        { name, pitch_type, body, is_default? }
POST /api/templates/:id/duplicate
PATCH /api/templates/:id
DELETE /api/templates/:id
POST /api/templates/preview  { body, lead } → { rendered }
```

---

## Frontend pages

| Route | File | Purpose |
|---|---|---|
| `/` | `DashboardPage.jsx` | KPI cards, 4 recharts charts, recent activity, quick actions |
| `/import` | `ImportPage.jsx` | CSV upload → preview table → confirm; duplicate/resend modals |
| `/pending` | `PendingLeadsPage.jsx` | Leads with status=pending; bulk select + send |
| `/sent` | `SentLeadsPage.jsx` | Leads with status=sent/failed/skipped; history view |
| `/templates` | `TemplatesPage.jsx` | Template CRUD with live preview |
| `/settings` | `SettingsPage.jsx` | WhatsApp connection panel + app info |

**WhatsApp auto-connect:** `App.jsx` mounts a `<WhatsAppAutoConnect>` component that polls
`/api/whatsapp/status` and triggers `POST /api/whatsapp/connect` whenever status is `disconnected`.
Retries every 3s until connected, then polls every 15s.

---

## Frontend lib

`src/lib/api.js` — every HTTP call goes through here. The `request()` function:
- Prepends `VITE_API_URL` to every path
- Always sends `Content-Type: application/json` (except file uploads which use `FormData`)
- Throws on non-2xx with `error.status` and `error.body` attached

`src/lib/format.js` — `formatDate()`, `formatNumber()`

`src/lib/messages.js` — doesn't exist on the frontend; classification/normalization is backend-only

---

## WhatsApp client singleton

`backend/src/whatsapp/client.js` exports:
- `initWhatsApp()` — creates the Client, sets up event handlers, calls `client.initialize()`
- `getClient()` — returns the singleton (used in send route)
- `getWhatsAppState()` — returns `{ status, qrDataUrl, info }`
- `logoutWhatsApp()` — calls `client.logout()` then `client.destroy()`, resets state

State machine: `disconnected → qr → connecting → ready`

Chrome is auto-detected from common Windows and Linux install paths, or can be overridden with
`PUPPETEER_EXECUTABLE_PATH`. Session is persisted under `.wwebjs_auth/` via `LocalAuth`.

---

## Known design decisions / gotchas

**In-memory state for jobs and preview cache:** Both the import preview cache and the send job
tracker are `Map` objects in Node process memory. They have TTL cleanup but will be lost on
process restart. If the backend crashes mid-send-job, the job is gone and the frontend gets a 404.
This is intentional for simplicity — no Redis dependency.

**`mode: "all"` in import confirm doesn't actually update existing leads.** The comment in
`import.js` says both `new_only` and `all` only insert genuinely new phone numbers. The distinction
between modes is mostly UI — the user gets to decide what to do with duplicates in the modal, but
the DB write is the same in both cases (only new phones). `mode: "selected"` filters by an explicit
phone list from the frontend.

**`confirmResend: false` is not a gate, it's a 409 prompt.** When the frontend calls `POST /api/send`
without `confirmResend: true` and there are already-messaged leads, the backend returns 409 with
`requiresConfirmation: true`. The frontend must call again with `confirmResend: true` to proceed.

**`send_count` increment is manual.** The backend does `lead.send_count + 1` in the update query —
it does not use a Postgres `increment` or rely on the DB to count. If two requests fire simultaneously
for the same lead, there's a race condition.

**No auth on any endpoint.** This is a personal tool. Every API route is open. Don't expose the
backend publicly without adding auth.

**Default template deletion is blocked.** `DELETE /api/templates/:id` returns 400 if `is_default` is
true. The user must set another template as default first.

---

## Tech stack summary

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite 5, React Router 6, TanStack Query 5, recharts, shadcn/ui (Radix), Tailwind 3, react-hook-form + zod |
| Backend | Node.js (ESM), Express 4, whatsapp-web.js 1.34, Puppeteer 24, PapaParse, multer, qrcode |
| Database | Supabase (Postgres), @supabase/supabase-js |
| Deploy target | Frontend → Vercel; Backend → Railway / Render / local PC |
