import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STALE_TIME } from "@/lib/queryConfig";
import { formatDateTime, formatNumber } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import PitchTag from "@/components/PitchTag";
import LeadDetailsSheet from "@/components/LeadDetailsSheet";
import LeadRowActions from "@/components/LeadRowActions";
import SortableTh from "@/components/SortableTh";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

export default function SentLeadsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("sent");
  const [pitchFilter, setPitchFilter] = useState("all");
  const [sortKey, setSortKey] = useState("last_sent_at-desc");
  const [selectedLead, setSelectedLead] = useState(null);

  const [sortBy, sortDir] = sortKey.split("-");

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["leads", "sent", { page, search, statusFilter, pitchFilter, sortBy, sortDir }],
    queryFn: () => api.getLeads({
      status: statusFilter,
      page,
      pageSize: PAGE_SIZE,
      sortBy,
      sortDir,
      ...(search ? { search } : {}),
      ...(pitchFilter !== "all" ? { pitch_type: pitchFilter } : {}),
    }),
    staleTime: STALE_TIME.leads,
    placeholderData: keepPreviousData,
  });

  const leads = data?.data || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const exportUrl = api.exportLeadsUrl({
    status: statusFilter,
    ...(search ? { search } : {}),
    ...(pitchFilter !== "all" ? { pitch_type: pitchFilter } : {}),
  });

  const toggleSort = (col) => {
    setSortKey((prev) => {
      const [pc, pd] = prev.split("-");
      if (pc === col) return `${col}-${pd === "asc" ? "desc" : "asc"}`;
      return `${col}-asc`;
    });
    setPage(1);
  };

  const selectClass = "h-9 bg-surface-container-lowest border-outline-variant text-body-sm";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Sent Leads</h2>
          <p className="text-muted-text text-body-sm mt-1">Outreach history and delivery status for every contacted lead.</p>
        </div>
        <a
          href={exportUrl}
          download
          className="flex items-center gap-2 bg-surface-container border border-outline-variant hover:border-primary px-4 py-2 text-label-md font-label-md text-on-surface transition-colors self-start"
        >
          <Icon name="download" className="text-lg" /> Export CSV
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center bg-surface-container-lowest border border-outline-variant px-3 h-9 focus-within:ring-2 focus-within:ring-primary">
          <Icon name="search" className="text-muted-text text-base" />
          <input
            placeholder="Search name, phone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="bg-transparent border-none focus:outline-none text-body-sm placeholder:text-muted-text w-44 ml-2"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className={cn("w-32", selectClass)}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
            <SelectItem value="replied">Replied</SelectItem>
          </SelectContent>
        </Select>
        <Select value={pitchFilter} onValueChange={(v) => { setPitchFilter(v); setPage(1); }}>
          <SelectTrigger className={cn("w-32", selectClass)}><SelectValue placeholder="All pitches" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pitches</SelectItem>
            <SelectItem value="POS">POS</SelectItem>
            <SelectItem value="WEBSITE">Website</SelectItem>
            <SelectItem value="GENERIC">General</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={setSortKey}>
          <SelectTrigger className={cn("w-40", selectClass)}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="last_sent_at-desc">Recently sent</SelectItem>
            <SelectItem value="last_sent_at-asc">Oldest sent</SelectItem>
            <SelectItem value="name-asc">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table container */}
      <div className="relative bg-surface-container border border-outline-variant overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-surface-container-high z-10">
              <tr className="border-b border-outline-variant">
                <SortableTh col="name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Business</SortableTh>
                <th className="p-3 text-label-md font-label-md text-muted-text uppercase tracking-wider">Phone</th>
                <th className="p-3 text-label-md font-label-md text-muted-text uppercase tracking-wider">Pitch</th>
                <th className="p-3 text-label-md font-label-md text-muted-text uppercase tracking-wider">Delivery</th>
                <SortableTh col="last_sent_at" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Date Sent</SortableTh>
                <th className="p-3 text-label-md font-label-md text-muted-text uppercase tracking-wider">Message</th>
                <th className="p-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-outline-variant">
                    {[...Array(7)].map((_, j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full max-w-[120px]" /></td>)}
                  </tr>
                ))
              ) : isError ? (
                <tr><td colSpan={7} className="py-16 text-center text-body-sm text-muted-text">Could not load sent leads</td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Icon name="mark_email_read" className="text-4xl text-muted-text" />
                    <p className="font-semibold text-on-surface mt-3">No sent leads yet</p>
                    <p className="text-body-sm text-muted-text mt-1">Leads appear here after your first outreach batch</p>
                  </div>
                </td></tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-outline-variant hover:bg-surface-container-highest transition-colors group">
                    <td className="p-3">
                      <button onClick={() => setSelectedLead(lead)} className="font-semibold text-on-surface hover:text-primary text-left transition-colors">{lead.name}</button>
                      {lead.city && <p className="text-[11px] text-muted-text mt-0.5">{lead.city}</p>}
                    </td>
                    <td className="p-3 font-mono text-body-sm text-muted-text">{lead.phone_raw || lead.phone}</td>
                    <td className="p-3"><PitchTag pitchType={lead.pitch_type} /></td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={lead.status} />
                        {lead.send_count > 1 && <span className="text-[11px] text-muted-text">×{lead.send_count}</span>}
                      </div>
                    </td>
                    <td className="p-3 text-body-sm text-muted-text tabular">{formatDateTime(lead.last_sent_at)}</td>
                    <td className="p-3">
                      {lead.last_error
                        ? <span className="text-[11px] text-rose line-clamp-2 max-w-[220px]">{lead.last_error}</span>
                        : <span className="text-[11px] text-muted-text line-clamp-2 max-w-[220px]">{lead.last_message || "—"}</span>}
                    </td>
                    <td className="p-3 text-right">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <LeadRowActions lead={lead} onView={setSelectedLead} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden flex flex-col divide-y divide-outline-variant">
          {isLoading ? (
            [...Array(6)].map((_, i) => <div key={i} className="p-4"><Skeleton className="h-16" /></div>)
          ) : leads.length === 0 ? (
            <div className="py-16 text-center">
              <Icon name="mark_email_read" className="text-4xl text-muted-text" />
              <p className="font-semibold text-on-surface mt-3">No sent leads yet</p>
            </div>
          ) : (
            leads.map((lead) => (
              <div key={lead.id} className="p-4 bg-surface-container-low">
                <div className="flex justify-between items-start gap-2">
                  <button onClick={() => setSelectedLead(lead)} className="min-w-0 text-left">
                    <p className="font-semibold text-on-surface truncate">{lead.name}</p>
                    <p className="text-[11px] text-muted-text font-mono mt-0.5">{lead.phone_raw || lead.phone}</p>
                  </button>
                  <LeadRowActions lead={lead} onView={setSelectedLead} />
                </div>
                <div className="flex justify-between items-center mt-3">
                  <StatusBadge status={lead.status} />
                  <span className="text-[11px] text-muted-text">{formatDateTime(lead.last_sent_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {isFetching && !isLoading && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary">
            <Icon name="progress_activity" className="animate-spin text-sm" /> Syncing
          </div>
        )}
      </div>

      {/* Pagination */}
      {leads.length > 0 && (
        <footer className="flex items-center justify-between gap-4 px-1">
          <div className="text-muted-text text-body-sm">
            {formatNumber((page - 1) * PAGE_SIZE + 1)}–{formatNumber(Math.min(page * PAGE_SIZE, totalCount))} of {formatNumber(totalCount)}
          </div>
          <div className="flex items-center gap-1">
            <button className="p-2 border border-outline-variant hover:bg-surface-container-high transition-colors disabled:opacity-30" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><Icon name="chevron_left" className="text-lg" /></button>
            <span className="px-3 text-body-sm text-muted-text">Page {page} of {totalPages}</span>
            <button className="p-2 border border-outline-variant hover:bg-surface-container-high transition-colors disabled:opacity-30" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><Icon name="chevron_right" className="text-lg" /></button>
          </div>
        </footer>
      )}

      <LeadDetailsSheet
        lead={selectedLead}
        open={!!selectedLead}
        onOpenChange={(v) => !v && setSelectedLead(null)}
      />
    </div>
  );
}
