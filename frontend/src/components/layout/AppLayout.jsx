import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Upload, Clock, CheckCircle2, FileText, Settings,
  Menu, Zap, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const NAV_ITEMS = [
  { to: "/",       label: "Dashboard",    icon: LayoutDashboard, end: true },
  { to: "/import", label: "Import & Send", icon: Upload },
  { to: "/leads",  label: "All Leads",    icon: Users },
  { to: "/pending",label: "Pending",      icon: Clock },
  { to: "/sent",   label: "Sent",         icon: CheckCircle2 },
  { to: "/templates", label: "Templates", icon: FileText },
  { to: "/settings",  label: "Settings",  icon: Settings },
];

const PAGE_META = {
  "/":          { title: "Dashboard",    subtitle: "Your outreach pipeline at a glance" },
  "/import":    { title: "Import & Send", subtitle: "Upload CSV, preview, confirm, and send" },
  "/leads":     { title: "All Leads",    subtitle: "Browse, search, and manage every lead" },
  "/pending":   { title: "Pending Leads", subtitle: "Leads waiting to be contacted" },
  "/sent":      { title: "Sent Leads",   subtitle: "Outreach history and delivery status" },
  "/templates": { title: "Templates",    subtitle: "Manage your outreach message templates" },
  "/settings":  { title: "Settings",     subtitle: "WhatsApp connection & app preferences" },
};

function WaStatusIndicator({ state }) {
  if (state === "ready") return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
      </span>
      <span className="text-xs text-ink-muted hidden sm:inline">Connected</span>
    </div>
  );
  if (state === "qr" || state === "connecting") return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-amber animate-pulse" />
      <span className="text-xs text-amber hidden sm:inline">
        {state === "qr" ? "Scan QR" : "Connecting..."}
      </span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-rose" />
      <span className="text-xs text-ink-muted hidden sm:inline">Offline</span>
    </div>
  );
}

function SidebarContent({ onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-line">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal/10 border border-teal/20 shrink-0">
          <Zap className="h-4 w-4 text-teal" />
        </div>
        <div>
          <p className="font-display text-sm font-bold text-ink leading-none">LeadFlow</p>
          <p className="text-[10px] text-ink-muted mt-0.5 leading-none">Ezra Dev Studio</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 group",
                isActive
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink border border-transparent"
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-teal" : "text-ink-muted group-hover:text-ink")} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-line px-5 py-4">
        <p className="text-[10px] text-ink-muted">v2.1 · Outreach & CRM</p>
      </div>
    </div>
  );
}

export function AppLayout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: statusData } = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: api.getWhatsAppStatus,
    refetchInterval: (query) => query.state.data?.status === "ready" ? 15000 : 4000,
  });

  const waState = statusData?.status || "disconnected";
  const meta = PAGE_META[location.pathname] || { title: "LeadFlow", subtitle: "" };

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-[220px] xl:w-[240px] shrink-0 flex-col border-r border-line bg-surface">
        <SidebarContent />
      </aside>

      {/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[260px] p-0 border-r border-line bg-surface">
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-line bg-canvas/90 backdrop-blur px-4 py-3 lg:px-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-md border border-line p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-base font-semibold text-ink leading-none truncate sm:text-lg">{meta.title}</h1>
              {meta.subtitle && <p className="text-xs text-ink-muted mt-0.5 hidden sm:block truncate">{meta.subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 shrink-0">
            <WaStatusIndicator state={waState} />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 py-5 lg:px-6 lg:py-6 max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
