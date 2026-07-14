# LeadFlow Backend

Express API + WhatsApp sender. Must run somewhere "always on" — **not Vercel**.

## Local setup

```bash
cd backend
pnpm install
cp .env.example .env
# Edit .env: add your Supabase URL + service role key
pnpm dev
```

On first run, a QR code becomes available at `GET /api/whatsapp/status` (as a data
URL) once you call `POST /api/whatsapp/connect`. The frontend dashboard shows this
QR automatically — scan it with WhatsApp (Linked Devices → Link a device).

The session is saved in `.wwebjs_auth/` — you only need to scan once.

## Database

Run `db/schema.sql`, then each numbered migration in order, in your Supabase
project's SQL editor:

- `db/schema.sql` — `leads` (one row per business, with outreach status
  tracking) and `send_log` (history of every send attempt)
- `db/002_templates_and_tracking.sql` — `templates` table + extra lead columns
- `db/003_send_jobs.sql` — `send_jobs` (persistent, resumable send jobs)
- `db/004_lead_events.sql` — `lead_events` (per-lead activity timeline shown
  in the Lead Detail modal on the All Leads page)

## API overview

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/leads/import` | Upload a CSV (multipart, field `file`) |
| GET | `/api/leads` | List leads, with `status`, `pitch_type`, `search`, `page` filters |
| GET | `/api/leads/stats` | Dashboard counts |
| PATCH | `/api/leads/:id` | Update a lead (status, category, etc) |
| DELETE | `/api/leads/:id` | Remove a lead |
| GET | `/api/whatsapp/status` | Connection state + QR code |
| POST | `/api/whatsapp/connect` | Start the WhatsApp client |
| POST | `/api/whatsapp/logout` | Disconnect and clear session |
| POST | `/api/send/check` | Check if leads were already messaged |
| POST | `/api/send` | Send messages (returns 409 if resend needs confirmation) |
| GET | `/api/leads/:id/events` | Per-lead activity timeline (imported/sent/failed/status changes) |
| POST | `/api/leads/bulk-delete` | Delete many leads at once, body `{ ids: [] }` |
| PATCH | `/api/leads/bulk` | Bulk update (e.g. reassign category), body `{ ids: [], updates: {} }` |

## Spam-safety / rate limiting

Send jobs pace themselves automatically to keep the WhatsApp number in good
standing. All of these are optional env vars with sane defaults:

| Env var | Default | Purpose |
|---|---|---|
| `SEND_DELAY_MIN_MS` / `SEND_DELAY_MAX_MS` | ~6s / ~12s | Random jitter between each message, instead of a flat delay |
| `DAILY_SEND_CAP` | `150` | Max messages sent per calendar day across all jobs (`0` = unlimited) |
| `BUSINESS_HOURS_START` / `BUSINESS_HOURS_END` | `8` / `20` | 24h server-local hours during which sending is allowed |
| `BUSINESS_HOURS_ENABLED` | `true` | Set to `false` to send around the clock |

When a job hits the daily cap or falls outside business hours, it pauses (not
stops) and a "Paused" entry appears in the send progress log; it resumes
automatically once the window reopens. "Stop Sending" still works instantly
while paused.

## Deployment options

**Railway / Render (recommended)**
- Both support persistent Node processes and a writable filesystem for
  `.wwebjs_auth/` (use a volume/disk so the session survives restarts).
- Set environment variables from `.env.example` in their dashboard.
- Set `FRONTEND_ORIGIN` to your deployed Vercel frontend URL.

**Your own PC**
- Works fine for personal use. Just leave `pnpm dev` running.
- Use a tool like [ngrok](https://ngrok.com) or [Tailscale](https://tailscale.com)
  to expose it to your deployed frontend if needed, or just run the frontend
  locally too.

## Notes on Chrome/Puppeteer

The client auto-detects an installed Chrome/Chromium on common paths. On Railway/
Render, install Chrome via their buildpack or use a Docker image with Chromium
pre-installed (e.g. `node:20-bookworm` + `apt-get install chromium`).
