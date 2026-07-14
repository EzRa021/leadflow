import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useReactTable, getCoreRowModel } from "@tanstack/react-table";
import { api } from "@/lib/api";
import { toast } from "@/lib/use-toast";
import { STALE_TIME } from "@/lib/queryConfig";
import { formatNumber } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import PitchTag from "@/components/PitchTag";
import RatingStars from "@/components/RatingStars";
import SendConfirmModal from "@/components/SendConfirmModal";
import SendProgressModal from "@/components/SendProgressModal";
import ResendConfirmModal from "@/components/ResendConfirmModal";
import SavedViewsBar from "@/components/SavedViewsBar";
import LeadDetailsSheet from "@/components/LeadDetailsSheet";
import LeadRowActions from "@/components/LeadRowActions";
import DeleteLeadDialog from "@/components/DeleteLeadDialog";
import SortableTh from "@/components/SortableTh";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export default function PendingLeadsPage() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [pitchFilter, setPitchFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [websiteFilter, setWebsiteFilter] = useState("all");
  const [sortKey, setSortKey] = useState("created_at-desc");
  const [rowSelection, setRowSelection] = useState({});

  // Range-based send controls
  const [useRange, setUseRange] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("1");
  const [rangeTo, setRangeTo] = useState("50");

  const [templateId, setTemplateId] = useState("default");
  const [showConfirm, setShowConfirm] = useState(false);
  const [sendJobId, setSendJobId] = useState(null);
  const [resendInfo, setResendInfo] = useState(null);
  const [pendingSend, setPendingSend] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [sortBy, sortDir] = sortKey.split("-");

  const activeFilters = useMemo(() => {
    const f = { status: "pending", sortBy, sortDir };
    if (search) f.search = search;
    if (pitchFilter !== "all") f.pitch_type = pitchFilter;
    if (categoryFilter !== "all") f.category = categoryFilter;
    if (websiteFilter !== "all") f.has_website = websiteFilter;
    return f;
  }, [search, pitchFilter, categoryFilter, websiteFilter, sortBy, sortDir]);

  const applySavedView = (filters = {}) => {
    setSearch(filters.search || "");
    setPitchFilter(filters.pitch_type || "all");
    setCategoryFilter(filters.category || "all");
    setWebsiteFilter(filters.has_website || "all");
    if (filters.sortBy && filters.sortDir) setSortKey(`${filters.sortBy}-${filters.sortDir}`);
    setPage(1);
  };

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["leads", "pending", { page, search, pitchFilter, categoryFilter, websiteFilter, sortBy, sortDir }],
    queryFn: () => api.getLeads({
      status: "pending",
      page,
      pageSize: PAGE_SIZE,
      sortBy,
      sortDir,
      ...(search ? { search } : {}),
      ...(pitchFilter !== "all" ? { pitch_type: pitchFilter } : {}),
      ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
      ...(websiteFilter !== "all" ? { has_website: websiteFilter } : {}),
    }),
    staleTime: STALE_TIME.leads,
    placeholderData: keepPreviousData,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.getCategories(),
    staleTime: STALE_TIME.categories,
  });
  const categories = categoriesData?.categories || [];

  const { data: activeJobData } = useQuery({
    queryKey: ["send-job", "active"],
    queryFn: api.getActiveSendJob,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (activeJobData?.job?.id) setSendJobId(activeJobData.job.id);
  }, [activeJobData]);

  const { data: templatesData } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.getTemplates(),
  });

  const { data: sendConfig } = useQuery({
    queryKey: ["send-config"],
    queryFn: api.getSendConfig,
    staleTime: Infinity,
  });
  const avgDelaySeconds = sendConfig?.avgDelaySeconds || 8;

  const templates = templatesData?.data || [];
  const leads = data?.data || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const table = useReactTable({
    data: leads,
    columns: [],
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const selectedIds = useMemo(
    () => table.getSelectedRowModel().rows.map((row) => row.original.id),
    [table, rowSelection],
  );

  const from1 = Math.max(1, parseInt(rangeFrom) || 1);
  const to1 = Math.max(from1, parseInt(rangeTo) || from1);
  const rangeCount = to1 - from1 + 1;

  const sendCount = useMemo(() => {
    if (selectedIds.length > 0) return selectedIds.length;
    if (!useRange) return totalCount;
    return Math.min(rangeCount, totalCount);
  }, [selectedIds.length, useRange, totalCount, rangeCount]);

  const sendDescription = useMemo(() => {
    if (selectedIds.length > 0) return `${formatNumber(selectedIds.length)} manually selected`;
    if (!useRange) return `all ${formatNumber(totalCount)} pending leads`;
    return `leads #${from1}–${to1} (${formatNumber(rangeCount)})`;
  }, [selectedIds, useRange, totalCount, from1, to1, rangeCount]);

  const templateName = useMemo(() => {
    if (templateId === "default") return "Per-category default";
    return templates.find((t) => t.id === templateId)?.name || "Selected template";
  }, [templateId, templates]);

  const allChecked = table.getIsAllRowsSelected();
  const someChecked = table.getIsSomeRowsSelected();
  const toggleAll = () => table.toggleAllRowsSelected(!allChecked);

  const sendMutation = useMutation({
    mutationFn: ({ ids, confirmResend, rangeFrom: rf, rangeTo: rt }) =>
      api.sendMessages(ids, {
        confirmResend,
        templateId: templateId !== "default" ? templateId : null,
        ...(ids.length === 0 && rf != null ? {
          rangeFrom: rf,
          rangeTo: rt,
          search,
          pitch_type: pitchFilter !== "all" ? pitchFilter : null,
          category: categoryFilter !== "all" ? categoryFilter : null,
          has_website: websiteFilter !== "all" ? websiteFilter : null,
          sortBy,
          sortDir,
        } : {}),
      }),
    onSuccess: (res) => {
      setShowConfirm(false);
      setResendInfo(null);
      setPendingSend(null);
      setSendJobId(res.jobId);
      setRowSelection({});
      toast({ variant: "success", title: "Sending started", description: `Outreach to ${formatNumber(res.total)} leads in progress` });
    },
    onError: (err) => {
      if (err.status === 409 && err.body?.requiresConfirmation) {
        setShowConfirm(false);
        const leadIds = pendingSend?.ids?.length ? pendingSend.ids : (err.body?.leadIds || []);
        setResendInfo({ ...err.body, leadIds });
      } else if (err.status === 503) {
        toast({ variant: "destructive", title: "WhatsApp offline", description: err.body?.error });
      } else {
        toast({ variant: "destructive", title: "Send failed", description: err.body?.error || err.message });
      }
    },
  });

  const handleSendClick = () => {
    if (selectedIds.length > 0) {
      setPendingSend({ ids: selectedIds, count: selectedIds.length, sendAll: false });
    } else if (!useRange) {
      setPendingSend({ ids: [], count: totalCount, sendAll: true, rangeFrom: 1, rangeTo: totalCount });
    } else {
      setPendingSend({ ids: [], count: rangeCount, sendAll: false, rangeFrom: from1, rangeTo: to1 });
    }
    setShowConfirm(true);
  };

  const handleJobComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => api.deleteLead(id),
    onSuccess: () => {
      toast({ variant: "success", title: "Lead deleted" });
      setDeleteTarget(null);
      setSelectedLead(null);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) => toast({ variant: "destructive", title: "Delete failed", description: err.body?.error || err.message }),
  });

  const toggleSort = (col) => {
    setSortKey((prev) => {
      const [pc, pd] = prev.split("-");
      if (pc === col) return `${col}-${pd === "asc" ? "desc" : "asc"}`;
      return `${col}-asc`;
    });
    setPage(1);
  };

  // Active filter chips (Stitch removable-chip treatment)
  const chips = [];
  if (search) chips.push({ label: `Search: ${search}`, clear: () => setSearch("") });
  if (pitchFilter !== "all") chips.push({ label: `Pitch: ${pitchFilter}`, clear: () => setPitchFilter("all") });
  if (categoryFilter !== "all") chips.push({ label: `Category: ${categoryFilter}`, clear: () => setCategoryFilter("all") });
  if (websiteFilter !== "all") chips.push({ label: websiteFilter === "true" ? "Has website" : "No website", clear: () => setWebsiteFilter("all") });

  if (isError) return (
    <div className="bg-surface-container border border-outline-variant p-16 text-center">
      <Icon name="cloud_off" className="text-4xl text-rose mx-auto block w-fit" />
      <p className="font-semibold text-on-surface mt-3">Could not load leads</p>
      <p className="text-body-sm text-muted-text mt-1 mb-4">Check backend connection and try again</p>
      <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["leads"] })}>Retry</Button>
    </div>
  );

  const selectClass = "h-9 bg-surface-container-lowest border-outline-variant text-body-sm";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Pending Outreach</h2>
          <p className="text-muted-text text-body-sm mt-1">Manage leads waiting for initial contact or follow-up sequence.</p>
        </div>
        <SavedViewsBar activeFilters={activeFilters} onApply={applySavedView} />
      </div>

      {/* Send Outreach controls */}
      <div className="bg-surface-container border border-outline-variant">
        <div className="px-5 py-4 border-b border-outline-variant">
          <p className="font-headline-md text-headline-md text-on-surface">Send Outreach</p>
          <p className="text-body-sm text-muted-text mt-0.5">Send to all pending leads, a custom range, or the rows you check below.</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setUseRange(false); setRowSelection({}); }}
              className={cn(
                "px-4 py-2 text-label-md font-label-md border transition-colors",
                !useRange && !selectedIds.length
                  ? "border-teal-accent/50 bg-teal-accent/10 text-teal-accent"
                  : "border-outline-variant text-muted-text hover:border-primary hover:text-on-surface",
              )}
            >
              Send All
            </button>
            <button
              onClick={() => { setUseRange(true); setRowSelection({}); }}
              className={cn(
                "px-4 py-2 text-label-md font-label-md border transition-colors",
                useRange && !selectedIds.length
                  ? "border-teal-accent/50 bg-teal-accent/10 text-teal-accent"
                  : "border-outline-variant text-muted-text hover:border-primary hover:text-on-surface",
              )}
            >
              Custom Range
            </button>
            {selectedIds.length > 0 && (
              <button
                onClick={() => setRowSelection({})}
                className="flex items-center gap-1 text-label-md text-muted-text hover:text-on-surface border border-outline-variant px-3 py-2"
              >
                <Icon name="close" className="text-sm" /> Clear selection ({selectedIds.length})
              </button>
            )}
          </div>

          {useRange && !selectedIds.length && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-body-sm text-muted-text">From</span>
                <Input type="number" min={1} value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="h-8 w-20 text-body-sm bg-surface-container-lowest border-outline-variant" />
                <span className="text-body-sm text-muted-text">To</span>
                <Input type="number" min={1} value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="h-8 w-20 text-body-sm bg-surface-container-lowest border-outline-variant" />
              </div>
              {[
                { label: "1–10", from: 1, to: 10 },
                { label: "1–50", from: 1, to: 50 },
                { label: "1–100", from: 1, to: 100 },
                { label: "51–100", from: 51, to: 100 },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => { setRangeFrom(String(p.from)); setRangeTo(String(p.to)); }}
                  className={cn(
                    "px-3 py-1.5 text-label-md border transition-colors",
                    String(rangeFrom) === String(p.from) && String(rangeTo) === String(p.to)
                      ? "border-teal-accent/50 bg-teal-accent/10 text-teal-accent"
                      : "border-outline-variant text-muted-text hover:border-primary hover:text-on-surface",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-outline-variant pt-4">
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="w-56 bg-surface-container-lowest border-outline-variant">
                <SelectValue placeholder="Default per pitch type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default per pitch type</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name} ({t.pitch_type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-3">
              <div className="border border-teal-accent/20 bg-teal-accent/5 px-4 py-2 text-center min-w-[120px]">
                <p className="text-[10px] text-muted-text uppercase tracking-wider">Will send to</p>
                <p className="font-headline-md text-headline-md text-teal-accent tabular">{formatNumber(sendCount)}</p>
                <p className="text-[10px] text-muted-text truncate max-w-[140px]">{sendDescription}</p>
              </div>
              <Button size="lg" onClick={handleSendClick} disabled={sendCount <= 0 || sendMutation.isPending}>
                {sendMutation.isPending
                  ? <><Icon name="progress_activity" className="animate-spin text-lg" /> Sending...</>
                  : <><Icon name="send" className="text-lg" /> Send Messages</>}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center bg-surface-container-lowest border border-outline-variant px-3 h-9 focus-within:ring-2 focus-within:ring-primary">
          <Icon name="search" className="text-muted-text text-base" />
          <input
            placeholder="Search name, phone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="bg-transparent border-none focus:outline-none text-body-sm placeholder:text-muted-text w-48 ml-2"
          />
        </div>
        <Select value={pitchFilter} onValueChange={(v) => { setPitchFilter(v); setPage(1); }}>
          <SelectTrigger className={cn("w-32", selectClass)}><SelectValue placeholder="All pitches" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pitches</SelectItem>
            <SelectItem value="POS">POS</SelectItem>
            <SelectItem value="WEBSITE">Website</SelectItem>
            <SelectItem value="GENERIC">General</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className={cn("w-36", selectClass)}><SelectValue placeholder="All niches" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All niches</SelectItem>
            {categories.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={websiteFilter} onValueChange={(v) => { setWebsiteFilter(v); setPage(1); }}>
          <SelectTrigger className={cn("w-32", selectClass)}><SelectValue placeholder="All websites" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All websites</SelectItem>
            <SelectItem value="true">With website</SelectItem>
            <SelectItem value="false">No website</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <button
              key={i}
              onClick={c.clear}
              className="flex items-center gap-1.5 px-3 py-1 bg-primary-container/20 border border-primary text-primary text-label-md font-label-md hover:bg-primary-container/30 transition-colors"
            >
              {c.label}
              <Icon name="close" className="text-xs" />
            </button>
          ))}
        </div>
      )}

      {/* Table container */}
      <div className="relative bg-surface-container border border-outline-variant overflow-hidden">
        {/* Bulk action bar */}
        {selectedIds.length > 0 && (
          <div className="absolute top-0 left-0 w-full z-20 bg-primary-container text-on-primary-container px-4 py-2.5 flex items-center justify-between animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-4">
              <span className="font-bold text-label-md">{selectedIds.length} Lead{selectedIds.length === 1 ? "" : "s"} Selected</span>
              <div className="h-4 w-px bg-on-primary-container/20" />
              <button onClick={handleSendClick} className="flex items-center gap-1 text-label-md font-bold hover:underline">
                <Icon name="bolt" className="text-sm" /> Send WhatsApp
              </button>
            </div>
            <button onClick={() => setRowSelection({})} className="text-on-primary-container/70 hover:text-on-primary-container">
              <Icon name="close" className="text-lg" />
            </button>
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-surface-container-high z-10">
              <tr className="border-b border-outline-variant">
                <th className="p-3 w-10">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <SortableTh col="name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Name</SortableTh>
                <SortableTh col="category" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Category</SortableTh>
                <th className="p-3 text-label-md font-label-md text-muted-text uppercase tracking-wider">Phone</th>
                <SortableTh col="total_score" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Rating</SortableTh>
                <th className="p-3 text-label-md font-label-md text-muted-text uppercase tracking-wider">Status</th>
                <th className="p-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-outline-variant">
                    <td className="p-3"><Skeleton className="h-4 w-4" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-32" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="p-3" />
                  </tr>
                ))
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <Icon name="pending_actions" className="text-4xl text-muted-text" />
                      <p className="font-semibold text-on-surface mt-3">No pending leads</p>
                      <p className="text-body-sm text-muted-text mt-1 mb-4">Import a CSV to build your outreach queue</p>
                      <Link to="/import"><Button variant="outline" size="sm">Import CSV</Button></Link>
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const lead = row.original;
                  const isSelected = row.getIsSelected();
                  const globalIdx = (page - 1) * PAGE_SIZE + row.index + 1;
                  const inRange = useRange && !selectedIds.length && globalIdx >= from1 && globalIdx <= to1;
                  return (
                    <tr
                      key={lead.id}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn(
                        "border-b border-outline-variant hover:bg-surface-container-highest transition-colors group",
                        isSelected && "bg-teal-accent/5",
                        inRange && !isSelected && "bg-teal-accent/5",
                      )}
                    >
                      <td className="p-3">
                        <Checkbox checked={isSelected} onCheckedChange={(v) => row.toggleSelected(!!v)} aria-label="Select row" />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSelectedLead(lead)} className="font-semibold text-on-surface hover:text-primary text-left transition-colors">
                            {lead.name}
                          </button>
                          {lead.website ? (
                            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-teal-accent hover:text-teal-accent/80" title={lead.website}>
                              <Icon name="language" className="text-sm" />
                            </a>
                          ) : (
                            <span className="text-muted-text/40" title="No website"><Icon name="language" className="text-sm" /></span>
                          )}
                        </div>
                        {lead.category && <p className="text-[11px] text-muted-text mt-0.5">{lead.category}</p>}
                      </td>
                      <td className="p-3"><PitchTag pitchType={lead.pitch_type} /></td>
                      <td className="p-3 font-mono text-body-sm text-muted-text">{lead.phone_raw || lead.phone}</td>
                      <td className="p-3"><RatingStars score={lead.total_score} reviews={lead.reviews_count} /></td>
                      <td className="p-3"><StatusBadge status={lead.status} /></td>
                      <td className="p-3 text-right">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <LeadRowActions lead={lead} onView={setSelectedLead} onDelete={setDeleteTarget} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked cards */}
        <div className="md:hidden flex flex-col divide-y divide-outline-variant">
          {isLoading ? (
            [...Array(6)].map((_, i) => <div key={i} className="p-4"><Skeleton className="h-16" /></div>)
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Icon name="pending_actions" className="text-4xl text-muted-text" />
              <p className="font-semibold text-on-surface mt-3">No pending leads</p>
              <Link to="/import" className="mt-4"><Button variant="outline" size="sm">Import CSV</Button></Link>
            </div>
          ) : (
            table.getRowModel().rows.map((row) => {
              const lead = row.original;
              const isSelected = row.getIsSelected();
              return (
                <div key={lead.id} className={cn("p-4 bg-surface-container-low", isSelected && "bg-teal-accent/5")}>
                  <div className="flex justify-between items-start gap-2">
                    <button onClick={() => setSelectedLead(lead)} className="min-w-0 text-left">
                      <p className="font-semibold text-on-surface truncate">{lead.name}</p>
                      <p className="text-[11px] text-muted-text font-mono mt-0.5">{lead.phone_raw || lead.phone}</p>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <LeadRowActions lead={lead} onView={setSelectedLead} onDelete={setDeleteTarget} />
                      <Checkbox checked={isSelected} onCheckedChange={(v) => row.toggleSelected(!!v)} aria-label="Select row" />
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-3">
                    <div className="flex items-center gap-2">
                      <PitchTag pitchType={lead.pitch_type} />
                      <RatingStars score={lead.total_score} reviews={lead.reviews_count} />
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Subtle refetch overlay */}
        {isFetching && !isLoading && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary">
            <Icon name="progress_activity" className="animate-spin text-sm" /> Syncing
          </div>
        )}
      </div>

      {/* Pagination footer */}
      <footer className="flex flex-col md:flex-row items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-4 text-muted-text text-body-sm">
          <span>Page Size: {PAGE_SIZE}</span>
          <span>
            Showing {totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalCount)} of {formatNumber(totalCount)} leads
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-2 border border-outline-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
            disabled={page === 1}
            onClick={() => setPage(1)}
          >
            <Icon name="first_page" className="text-lg" />
          </button>
          <button
            className="p-2 border border-outline-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <Icon name="chevron_left" className="text-lg" />
          </button>
          <span className="px-3 text-body-sm text-muted-text">Page {page} of {totalPages}</span>
          <button
            className="p-2 border border-outline-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <Icon name="chevron_right" className="text-lg" />
          </button>
          <button
            className="p-2 border border-outline-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
            disabled={page >= totalPages}
            onClick={() => setPage(totalPages)}
          >
            <Icon name="last_page" className="text-lg" />
          </button>
        </div>
      </footer>

      <SendConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => sendMutation.mutate({
          ids: pendingSend?.ids || [],
          confirmResend: false,
          rangeFrom: pendingSend?.rangeFrom,
          rangeTo: pendingSend?.rangeTo,
        })}
        leadCount={pendingSend?.count || sendCount}
        templateName={templateName}
        estimatedSeconds={(pendingSend?.count || sendCount) * avgDelaySeconds}
        isSending={sendMutation.isPending}
      />

      <SendProgressModal jobId={sendJobId} onClose={() => setSendJobId(null)} onComplete={handleJobComplete} />

      <ResendConfirmModal
        info={resendInfo}
        onConfirm={() => sendMutation.mutate({ ids: resendInfo.leadIds, confirmResend: true })}
        onCancel={() => setResendInfo(null)}
        isSending={sendMutation.isPending}
      />

      <LeadDetailsSheet
        lead={selectedLead}
        open={!!selectedLead}
        onOpenChange={(v) => !v && setSelectedLead(null)}
        onDelete={(l) => { setSelectedLead(null); setDeleteTarget(l); }}
      />

      <DeleteLeadDialog
        lead={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
