# LeadFlow Frontend

React + Vite dashboard. Deploy this to **Vercel**.

## Local setup

```bash
cd frontend
pnpm install
cp .env.example .env
# Set VITE_API_URL to your backend URL
pnpm dev
```

## Deploy to Vercel

1. Push this `frontend/` folder as (or within) a git repo.
2. Import the project in Vercel, set **root directory** to `frontend`.
3. Add environment variable `VITE_API_URL` = your backend's public URL
   (e.g. `https://leadflow-backend.up.railway.app`).
4. Deploy.

## Features

- **Dashboard stats** — total leads, pending, sent, failed/skipped, replied
- **CSV import** — drag-and-drop, deduplicates against existing leads by phone
- **Leads table** — search, filter by status/pitch type, pagination
- **Bulk select + send** — checkbox selection, sends via your backend's
  WhatsApp connection
- **Resend confirmation** — if any selected lead was already messaged, shows
  a modal asking to confirm before resending
- **WhatsApp connection panel** — shows QR code to scan, live connection status
