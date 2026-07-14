-- LeadFlow database schema
-- Run this in your Supabase SQL editor (or any Postgres instance)

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),

  -- Core info from CSV
  name text not null,
  phone text not null,            -- normalized to "234XXXXXXXXXX" format
  phone_raw text,                 -- original phone string from CSV
  category text,
  pitch_type text default 'GENERIC',  -- POS | WEBSITE | GENERIC
  city text,
  state text,
  street text,
  website text,
  total_score numeric,
  reviews_count integer,
  maps_url text,

  -- Outreach tracking
  status text not null default 'pending', -- pending | sent | failed | skipped | replied
  send_count integer not null default 0,
  last_sent_at timestamptz,
  last_message text,              -- the actual message body that was sent
  last_error text,

  -- Metadata
  source_csv text,                -- filename of the CSV this came from
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Prevent duplicate leads by phone number
  unique (phone)
);

create index if not exists idx_leads_status on leads (status);
create index if not exists idx_leads_pitch_type on leads (pitch_type);
create index if not exists idx_leads_phone on leads (phone);

-- Auto-update updated_at on every change
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_updated_at on leads;
create trigger trg_leads_updated_at
  before update on leads
  for each row
  execute function set_updated_at();

-- Optional: a log of every send attempt (for history / debugging)
create table if not exists send_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  status text not null,           -- sent | failed | skipped
  message text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_send_log_lead_id on send_log (lead_id);
