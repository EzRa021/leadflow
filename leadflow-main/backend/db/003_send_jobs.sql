-- LeadFlow migration 003: persistent send jobs (survive restarts/refresh)
-- Run this in your Supabase SQL editor AFTER 002_templates_and_tracking.sql

create table if not exists send_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running',   -- running | stopping | stopped | done
  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  template_name text,
  template_id uuid references templates(id) on delete set null,
  lead_ids uuid[] not null default '{}',    -- the exact set of leads this job targets, resolved once at start
  cursor integer not null default 0,        -- index into lead_ids of the next lead to process (for resume)
  log jsonb not null default '[]',          -- rolling list of {at, name, phone, status, note}
  stop_requested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_send_jobs_status on send_jobs (status);

drop trigger if exists trg_send_jobs_updated_at on send_jobs;
create trigger trg_send_jobs_updated_at
  before update on send_jobs
  for each row
  execute function set_updated_at();

-- ─────────────────────────────────────────────
-- Leads: filtering columns used by Pending Leads filters
-- (website/niche already exist as website/category; country is new)
-- ─────────────────────────────────────────────
alter table leads
  add column if not exists country text;

-- Fast "has website" filtering without scanning full text column
create index if not exists idx_leads_website_isnull on leads ((website is not null and website <> ''));
create index if not exists idx_leads_category on leads (category);
create index if not exists idx_leads_country on leads (country);
create index if not exists idx_leads_state on leads (state);
create index if not exists idx_leads_city on leads (city);

-- Composite index to speed up the common Pending Leads query
-- (status filter + created_at ordering, which range-select relies on)
create index if not exists idx_leads_status_created_at on leads (status, created_at);
