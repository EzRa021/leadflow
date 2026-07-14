# LeadFlow — Lead Outreach Manager

A personal tool for Ezra to upload Google Maps lead exports, track outreach status,
and send WhatsApp messages — without re-messaging leads that already got contacted.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│  Frontend        │  HTTP   │  Backend          │         │  Supabase   │
│  React + Vite    │ ──────► │  Node + Express   │ ──────► │  Postgres   │
│  (Vercel)        │ ◄────── │  + whatsapp-web.js│         │  (DB)       │
└─────────────────┘  poll   │  (Railway/Render  │         └─────────────┘
                              │   or your PC)    │
                              └──────────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │  WhatsApp Web     │
                              │  (Puppeteer/Chrome)│
                              └──────────────────┘
```

**Why split this way:** `whatsapp-web.js` needs a persistent Chrome process with a
logged-in session. Vercel (and any serverless platform) kills processes after each
request, so the WhatsApp connection would drop constantly. The backend needs to run
on something "always on" — Railway, Render, Fly.io, a cheap VPS, or even your own PC
left running.

## Folders

- `frontend/` — React + Vite app (deploy to Vercel)
- `backend/` — Express API + WhatsApp sender (deploy to Railway/Render, or run locally)

## Setup order

1. Create a free [Supabase](https://supabase.com) project, run `backend/db/schema.sql`
   in the SQL editor.
2. Copy `backend/.env.example` to `backend/.env`, fill in your Supabase URL + key.
3. `cd backend && pnpm install && pnpm dev`
4. Scan the QR code shown in terminal / frontend with WhatsApp.
5. `cd frontend && pnpm install && pnpm dev`
6. Open the frontend, set `VITE_API_URL` to point at your backend.

See `backend/README.md` and `frontend/README.md` for details.
