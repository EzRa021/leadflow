# CLAUDE.md — LeadFlow

Personal WhatsApp outreach CRM. Imports Google Maps CSV leads, dedupes by phone, sends
personalized WhatsApp messages via whatsapp-web.js. Core invariant: never re-message an
already-contacted lead unless explicitly confirmed.

## Stack
React 18 + Vite 5 (frontend, Vercel) · Node/Express (backend, must run persistently —
NOT serverless, holds a live Puppeteer/WhatsApp session) · Supabase/Postgres · pnpm both sides.

## Structure
```
frontend/src/{pages,components,lib/{api.js,format.js}}
backend/src/{index.js, routes/{leads,import,send,templates,whatsapp,inbox,views}.js,
             client.js (WhatsApp singleton), lib/messages.js, db/supabase.js}
backend/db/*.sql   — numbered migrations, run in order (no 006 — see skill for why)
```

## Non-negotiables
- All frontend HTTP calls go through `frontend/src/lib/api.js` — never fetch() directly in components.
- Backend must stay a persistent process (Puppeteer + WhatsApp session in `.wwebjs_auth/`).
- `leads.phone` is UNIQUE — the dedup key. Always normalize via `normalizePhone()` before compare.
- Any change touching import, send, or filter/sort logic → read the `leadflow-conventions` skill
  first. Those flows have non-obvious state (persisted job cursors, in-memory caches, a 409-based
  confirm gate) that's easy to break by assuming the naive version.

## Run locally
```bash
cd backend && pnpm dev    # :4000
cd frontend && pnpm dev   # :5173
```

## Full reference
Detailed flows, DB schema, API routes, and known gotchas live in
`.claude/skills/leadflow-conventions/SKILL.md` — Claude loads it automatically when relevant.
