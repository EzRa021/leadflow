import { Outlet, NavLink, useLocation, Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/icon";
import { useWhatsAppStatus } from "@/lib/useWhatsAppStatus";
import { Sheet, SheetContent } from "@/components/ui/sheet";

// Real app routes, styled with Stitch's sidenav treatment + Material Symbols.
const NAV_ITEMS = [
  { to: "/",          label: "Dashboard", icon: "dashboard",       end: true },
  { to: "/import",    label: "Import",    icon: "upload_file" },
  { to: "/leads",     label: "All Leads", icon: "groups" },
  { to: "/pending",   label: "Pending",   icon: "pending_actions" },
  { to: "/sent",      label: "Sent",      icon: "mark_email_read" },
  { to: "/inbox",     label: "Inbox",     icon: "chat" },
  { to: "/templates", label: "Templates", icon: "layers" },
];

const PAGE_META = {
  "/":          { title: "Dashboard",     subtitle: "Your outreach pipeline at a glance" },
  "/import":    { title: "Import & Send",  subtitle: "Upload CSV, preview, confirm, and send" },
  "/leads":     { title: "All Leads",     subtitle: "Browse, search, and manage every lead" },
  "/pending":   { title: "Pending Leads",  subtitle: "Leads waiting to be contacted" },
  "/sent":      { title: "Sent Leads",    subtitle: "Outreach history and delivery status" },
  "/inbox":     { title: "Inbox",         subtitle: "WhatsApp replies from your leads" },
  "/templates": { title: "Templates",    subtitle: "Manage your outreach message templates" },
  "/settings":  { title: "Settings",     subtitle: "WhatsApp connection & app preferences" },
};

const WA_LABEL = {
  ready: "Online",
  qr: "Scan QR",
  connecting: "Connecting",
  disconnected: "Offline",
};

// Header status pill — Stitch's "Status: Online" treatment, driven by the
// real WhatsApp connection state.
function WaStatusPill({ state }) {
  const ready = state === "ready";
  const pending = state === "qr" || state === "connecting";
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 text-label-md font-label-md border",
        ready && "text-teal-accent bg-teal-accent/10 border-teal-accent/20",
        pending && "text-amber-warning bg-amber-warning/10 border-amber-warning/20",
        !ready && !pending && "text-muted-text bg-surface-container-high border-outline-variant",
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          ready && "bg-teal-accent animate-pulse",
          pending && "bg-amber-warning animate-pulse",
          !ready && !pending && "bg-rose",
        )}
      />
      Status: {WA_LABEL[state] || "Offline"}
    </span>
  );
}

function useUnreadInboxCount() {
  const { data } = useQuery({
    queryKey: ["inbox"],
    queryFn: api.getInbox,
    refetchInterval: 5000,
  });
  const conversations = data?.conversations || [];
  return conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
}

function SidebarContent({ onNavigate }) {
  const unreadCount = useUnreadInboxCount();
  return (
    <div className="flex h-full flex-col bg-surface-container-low">
      {/* Brand */}
      <div className="px-4 py-5">
        <h1 className="font-headline-md text-headline-md font-bold text-primary leading-none">LeadFlow</h1>
        <p className="text-[10px] uppercase tracking-widest text-muted-text mt-1.5">Mission Control</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 mt-2 px-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 transition-all duration-200 active:scale-[0.98]",
                isActive
                  ? "text-primary bg-primary-container/10 border-l-2 border-primary font-semibold"
                  : "text-muted-text hover:text-on-surface hover:bg-surface-container-high border-l-2 border-transparent",
              )
            }
          >
            <Icon name={item.icon} className="text-xl" />
            <span className="font-body-md flex-1">{item.label}</span>
            {item.to === "/inbox" && unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-accent px-1.5 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer: New Outreach CTA + Settings/Support */}
      <div className="p-4 border-t border-outline-variant space-y-1">
        <Link
          to="/import"
          onClick={onNavigate}
          className="flex w-full items-center justify-center gap-2 bg-teal-accent text-white py-2 font-semibold mb-3 hover:brightness-110 active:scale-[0.97] transition-all"
        >
          <Icon name="add" className="text-lg" /> New Outreach
        </Link>
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 py-2 transition-colors",
              isActive
                ? "text-primary bg-primary-container/10 font-semibold"
                : "text-muted-text hover:text-on-surface hover:bg-surface-container-high",
            )
          }
        >
          <Icon name="settings" className="text-xl" />
          <span className="font-body-md">Settings</span>
        </NavLink>
        <div className="flex items-center gap-3 px-3 py-2 text-[10px] text-muted-text/70 uppercase tracking-wider">
          v2.1 · Ezra Dev Studio
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: statusData } = useWhatsAppStatus();
  const waState = statusData?.status || "disconnected";
  const meta = PAGE_META[location.pathname] || { title: "LeadFlow", subtitle: "" };

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-outline-variant">
        <SidebarContent />
      </aside>

      {/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[260px] p-0 border-r border-outline-variant">
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-outline-variant bg-surface/80 backdrop-blur-md px-4 md:px-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 text-muted-text hover:text-on-surface transition-colors"
              aria-label="Open menu"
            >
              <Icon name="menu" className="text-xl" />
            </button>
            <div className="min-w-0">
              <h1 className="font-headline-md text-headline-md text-on-surface leading-none truncate">{meta.title}</h1>
              {meta.subtitle && <p className="text-body-sm text-muted-text mt-0.5 hidden sm:block truncate">{meta.subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <WaStatusPill state={waState} />
            <div className="hidden sm:flex items-center gap-1">
              <Link to="/inbox" className="p-1.5 text-on-surface-variant hover:text-primary transition-colors">
                <Icon name="notifications" className="text-xl" />
              </Link>
              <Link to="/settings" className="p-1.5 text-on-surface-variant hover:text-primary transition-colors">
                <Icon name="account_circle" className="text-xl" />
              </Link>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 py-6 md:px-8 max-w-[1440px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
