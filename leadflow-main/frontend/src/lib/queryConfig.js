// Shared TanStack Query tuning constants — see CLAUDE.md "Server state &
// data fetching" section for rationale. Centralized so all pages agree on
// how long each resource is considered fresh.

export const STALE_TIME = {
  // Leads change often (imports, sends, edits) but not so often that every
  // filter tweak needs a fresh network round-trip within the same 30s.
  leads: 30_000,
  // Categories only change when leads are imported/reassigned — cheap to
  // cache longer.
  categories: 5 * 60_000,
};
