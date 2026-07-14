-- LeadFlow migration 002: message templates + richer tracking
-- Run this in your Supabase SQL editor AFTER schema.sql

-- ─────────────────────────────────────────────
-- Templates
-- ─────────────────────────────────────────────
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pitch_type text not null default 'GENERIC', -- POS | WEBSITE | GENERIC | CUSTOM
  body text not null,                          -- supports {{name}}, {{company}}, {{email}}, {{phone}}
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_templates_pitch_type on templates (pitch_type);

drop trigger if exists trg_templates_updated_at on templates;
create trigger trg_templates_updated_at
  before update on templates
  for each row
  execute function set_updated_at();

-- Only one default template per pitch_type
create unique index if not exists uniq_default_per_pitch
  on templates (pitch_type)
  where is_default = true;

-- ─────────────────────────────────────────────
-- Leads: extra tracking columns
-- ─────────────────────────────────────────────
alter table leads
  add column if not exists email text,
  add column if not exists company text,
  add column if not exists import_batch_id uuid,
  add column if not exists imported_at timestamptz not null default now();

create index if not exists idx_leads_import_batch on leads (import_batch_id);

-- ─────────────────────────────────────────────
-- send_log: track which template was used
-- ─────────────────────────────────────────────
alter table send_log
  add column if not exists template_id uuid references templates(id) on delete set null,
  add column if not exists template_name text;

-- ─────────────────────────────────────────────
-- Seed default templates (matches previous hardcoded messages)
-- ─────────────────────────────────────────────
insert into templates (name, pitch_type, body, is_default)
values
  (
    'POS — Retail outreach',
    'POS',
    'Hi, I''m Ezra — a software developer.

I came across *{{name}}* on Google Maps. I build *Quantum POS*, a point-of-sale system for retail businesses — handles sales, inventory, and daily reports, works fully offline, no monthly fees.

I can build a custom version for *{{name}}*, with a website to match, so your store and online presence work as one system.

Open to a quick demo?',
    true
  ),
  (
    'Website — Restaurants & hospitality',
    'WEBSITE',
    'Hi, I''m Ezra — a web developer.

I came across *{{name}}* on Google Maps and noticed you don''t have a website yet. A simple site helps customers find you, see your menu or services, and reach out — and builds trust.

I can also pair it with a custom point-of-sale system, so your online presence and in-store operations work together.

Open to a quick chat?',
    true
  ),
  (
    'General outreach',
    'GENERIC',
    'Hi, I''m Ezra — a software developer.

I came across *{{name}}* on Google Maps. I build websites, point-of-sale systems, and custom software for businesses — tailored to how you actually operate, not off-the-shelf templates.

Happy to put together something specific for *{{name}}*.

Open to a quick chat?',
    true
  )
on conflict do nothing;
