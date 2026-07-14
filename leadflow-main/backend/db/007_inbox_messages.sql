-- LeadFlow migration 007: WhatsApp reply inbox
-- Run this in your Supabase SQL editor AFTER 002/003/004/005 migrations.
--
-- Backs the /api/inbox routes (backend/src/routes/inbox.js) and the WhatsApp
-- inbound-message listener (backend/src/client.js handleInboundMessage).
-- One row per message (both directions) so a full thread can be
-- reconstructed per lead. Named 007 because 006_index_tuning.sql referenced
-- in CLAUDE.md doesn't actually exist on disk (documentation drift) —
-- don't reuse "006" for this without checking again first.

create table if not exists inbox_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  is_read boolean not null default false,
  whatsapp_message_id text,
  created_at timestamptz not null default now()
);

-- client.js's handleInboundMessage() relies on a duplicate-key error here to
-- silently no-op replayed messages on WhatsApp reconnect. This MUST be a
-- partial unique index (not a table-level UNIQUE constraint), because
-- whatsapp_message_id is null for every manual outbound reply and we need to
-- allow MANY null rows. A plain `unique (whatsapp_message_id)` in Postgres
-- already allows multiple nulls, but `unique nulls not distinct` (an earlier
-- version of this migration) does the opposite — it collapses all nulls into
-- one, so a second manual reply would fail the constraint. The partial index
-- below sidesteps that entirely by only indexing non-null ids.
create unique index if not exists uniq_whatsapp_message_id
  on inbox_messages (whatsapp_message_id)
  where whatsapp_message_id is not null;

-- Powers GET /api/inbox (grouping by lead, ordered by recency) and
-- GET /api/inbox/:leadId (thread for one lead, chronological).
create index if not exists idx_inbox_messages_lead_id on inbox_messages (lead_id, created_at);
create index if not exists idx_inbox_messages_created_at on inbox_messages (created_at desc);

-- Speeds up the unread-count scan in GET /api/inbox and the
-- POST /:leadId/read bulk-update.
create index if not exists idx_inbox_messages_unread
  on inbox_messages (lead_id)
  where direction = 'inbound' and is_read = false;
