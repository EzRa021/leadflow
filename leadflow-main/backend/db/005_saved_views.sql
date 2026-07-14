-- LeadFlow migration 005: saved filter presets (Tier 3 roadmap item #10)
-- Run this in your Supabase SQL editor AFTER 002/003/004 migrations.
--
-- Single-user tool (see CLAUDE.md "No auth on any endpoint"), so this is
-- intentionally not scoped per-user — it's a shared list of saved views,
-- same as templates. If multi-user auth is added later, add a `user_id`
-- column and filter by it.

create table if not exists user_views (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Raw query-string-shaped filter object, e.g.
  -- { "status": "pending", "category": "Restaurant", "has_website": "false", "sortBy": "created_at", "sortDir": "desc" }
  filters jsonb not null default '{}'::jsonb,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_views_pinned on user_views (is_pinned desc, created_at desc);
