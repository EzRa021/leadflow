# Deprecated files

These files are leftovers from an earlier iteration of LeadFlow that used a custom
component library instead of shadcn/ui. They are **not imported anywhere** in the
current app and are kept here only for reference. Safe to delete entirely.

- `ui.jsx` — old custom Card/Button/Dialog/etc. Replaced by `src/components/ui/*` (shadcn).
- `Sidebar.jsx`, `TopHeader.jsx` — old nav components. Replaced by `src/components/layout/AppLayout.jsx`.
- `UploadPanel.jsx`, `LeadsTable.jsx`, `StatsBar.jsx` — old dashboard/import widgets. Replaced
  by the dedicated pages (`ImportPage`, `PendingLeadsPage`, `SentLeadsPage`, `DashboardPage`).
- `toast.jsx` — old toast context. Replaced by `src/lib/use-toast.js` + `src/components/ui/toaster.jsx`.
