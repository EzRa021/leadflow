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

Run `db/schema.sql` in your Supabase project's SQL editor. This creates:

- `leads` — one row per business, with outreach status tracking
- `send_log` — history of every send attempt

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
