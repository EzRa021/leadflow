-- LeadFlow migration 004: per-lead activity timeline
-- Run this in your Supabase SQL editor AFTER 003_send_jobs.sql
--
-- Powers the activity timeline in the Lead Detail modal (Tier 1 roadmap item #3).
-- send_log already has most send-related history; lead_events is a lighter,
-- append-only log covering the full lifecycle (imported, sent, failed,
-- skipped, status changes, deletes) in one place for easy chronological display.

create table if not exists lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  event_type text not null,   -- imported | sent | failed | skipped | status_changed | note
  detail text,                -- short human-readable description
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_events_lead_id on lead_events (lead_id, created_at desc);
