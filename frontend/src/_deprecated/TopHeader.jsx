import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../lib/api";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/import", label: "Import leads" },
  { to: "/pending", label: "Pending leads" },
  { to: "/sent", label: "Sent leads" },
  { to: "/templates", label: "Templates" },
  { to: "/settings", label: "Settings" },
];

export default function TopHeader({ title, subtitle }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: api.getWhatsAppStatus,
    refetchInterval: (query) => (query.state.data?.status === "ready" ? 15000 : 4000),
  });

  const state = status?.status || "disconnected";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg border border-line p-2 text-muted lg:hidden"
            aria-label="Toggle navigation"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <div>
            <h1 className="font-display text-base font-semibold text-ink sm:text-lg">{title}</h1>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs">
          <StatusDot state={state} />
          <span className="hidden text-muted sm:inline">
            {state === "ready" ? "WhatsApp connected" : state === "qr" ? "Scan QR to connect" : "WhatsApp offline"}
          </span>
        </div>
      </div>

      {mobileOpen && (
        <nav className="border-t border-line px-4 py-2 lg:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}

function StatusDot({ state }) {
  const colors = {
    ready: "bg-accent",
    qr: "bg-warn",
    connecting: "bg-warn",
    disconnected: "bg-muted",
  };

  return (
    <span className="relative flex h-2 w-2">
      {state === "ready" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${colors[state] || colors.disconnected}`} />
    </span>
  );
}
