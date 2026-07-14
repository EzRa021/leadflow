import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useReactTable, getCoreRowModel } from "@tanstack/react-table";
import { api } from "@/lib/api";
import { toast } from "@/lib/use-toast";
import { STALE_TIME } from "@/lib/queryConfig";
import { formatDate, formatNumber } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import PitchTag from "@/components/PitchTag";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export default function AllLeadsPage() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pitchFilter, setPitchFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [websiteFilter, setWebsiteFilter] = useState("all");
  const [sortKey, setSortKey] = useState("created_at-desc");
  const [selectedLead, setSelectedLead] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [rowSelection, setRowSelection] = useState({});
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");

  const [sortBy, sortDir] = sortKey.split("-");

  const activeFilters = useMemo(() => {
    const f = { sortBy, sortDir };
    if (search) f.search = search;
    if (statusFilter !== "all") f.status = statusFilter;
    if (pitchFilter !== "all") f.pitch_type = pitchFilter;
    if (categoryFilter !== "all") f.category = categoryFilter;
    if (websiteFilter !== "all") f.has_website = websiteFilter;
    return f;
  }, [search, statusFilter, pitchFilter, categoryFilter, websiteFilter, sortBy, sortDir]);

  const applySavedView = (filters = {}) => {
    setSearch(filters.search || "");
    setStatusFilter(filters.status || "all");
    setPitchFilter(filters.pitch_type || "all");
    setCategoryFilter(filters.category || "all");
    setWebsiteFilter(filters.has_website || "all");
    if (filters.sortBy && filters.sortDir) setSortKey(`${filters.sortBy}-${filters.sortDir}`);
    setPage(1);
  };

  const leadsQueryKey = ["leads", "all", { page, search, statusFilter, pitchFilter, categoryFilter, websiteFilter, sortBy, sortDir }];

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: leadsQueryKey,
    queryFn: () => api.getLeads({
      page,
      pageSize: PAGE_SIZE,
      sortBy,
      sortDir,
      ...(search ? { search } : {}),
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
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

  const allChecked = table.getIsAllRowsSelected();
  const someChecked = table.getIsSomeRowsSelected();
  const toggleAll = () => table.toggleAllRowsSelected(!allChecked);

  const deleteMutation = useMutation({
    mutationFn: (id) => api.deleteLead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: leadsQueryKey });
      const previous = queryClient.getQueryData(leadsQueryKey);
      queryClient.setQueryData(leadsQueryKey, (old) => old && ({
        ...old,
        data: old.data.filter((l) => l.id !== id),
        count: Math.max(0, (old.count || 0) - 1),
      }));
      return { previous };
    },
    onSuccess: () => {
      toast({ variant: "success", title: "Lead deleted" });
      setDeleteTarget(null);
      setSelectedLead(null);
    },
    onError: (err, id, context) => {
      if (context?.previous) queryClient.setQueryData(leadsQueryKey, context.previous);
      toast({ variant: "destructive", title: "Delete failed", description: err.message });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const handleDeleteRequest = (lead) => { setSelectedLead(null); setDeleteTarget(lead); };

  const bulkDeleteMutation = useMutation({
    mutationFn: () => api.bulkDeleteLeads(selectedIds),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: leadsQueryKey });
      const previous = queryClient.getQueryData(leadsQueryKey);
      const idSet = new Set(selectedIds);
      queryClient.setQueryData(leadsQueryKey, (old) => old && ({
        ...old,
        data: old.data.filter((l) => !idSet.has(l.id)),
        count: Math.max(0, (old.count || 0) - idSet.size),
      }));
      return { previous };
    },
    onSuccess: (res) => {
      toast({ variant: "success", title: "Leads deleted", description: `${formatNumber(res.deletedCount)} leads removed` });
      setRowSelection({});
      setBulkDeleteOpen(false);
    },
    onError: (err, vars, context) => {
      if (context?.previous) queryClient.setQueryData(leadsQueryKey, context.previous);
      toast({ variant: "destructive", title: "Bulk delete failed", description: err.body?.error || err.message });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const bulkCategoryMutation = useMutation({
    mutationFn: () => api.bulkUpdateLeads(selectedIds, { category: bulkCategory }),
    onSuccess: (res) => {
      toast({ variant: "success", title: "Category updated", description: `${formatNumber(res.updatedCount)} leads reassigned to "${bulkCategory}"` });
      setRowSelection({});
      setBulkCategory("");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err) => toast({ variant: "destructive", title: "Bulk update failed", description: err.body?.error || err.message }),
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

  if (isError) return (
    <div className="bg-surface-container border border-outline-variant p-16 text-center">
      <Icon name="cloud_off" className="text-4xl text-rose mx-auto block w-fit" />
      <p className="font-semibold text-on-surface mt-3">Could not load leads</p>
      <p className="text-body-sm text-muted-text mt-1 mb-4">Check backend connection and try again</p>
      <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["leads"] })}>Retry</Button>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface flex items-center gap-2">
            All Leads
            <span className="text-body-sm text-muted-text font-normal">({formatNumber(totalCount)})</span>
          </h2>
          <p className="text-muted-text text-body-sm mt-1">Browse, search, and manage every lead in your database.</p>
        </div>
        <SavedViewsBar activeFilters={activeFilters} onApply={applySavedView} />
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
          {search && (
            <button onClick={() => { setSearch(""); setPage(1); }} className="text-muted-text hover:text-on-surface"><Icon name="close" className="text-sm" /></button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className={cn("w-32", selectClass)}><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
            <SelectItem value="replied">Replied</SelectItem>
          </SelectContent>
        </Select>
        <Select value={pitchFilter} onValueChange={(v) => { setPitchFilter(v); setPage(1); }}>
          <SelectTrigger className={cn("w-28", selectClass)}><SelectValue placeholder="All pitches" /></SelectTrigger>
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
        <Select value={sortKey} onValueChange={setSortKey}>
          <SelectTrigger className={cn("w-40", selectClass)}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at-desc">Newest first</SelectItem>
            <SelectItem value="created_at-asc">Oldest first</SelectItem>
            <SelectItem value="name-asc">Name A–Z</SelectItem>
            <SelectItem value="name-desc">Name Z–A</SelectItem>
            <SelectItem value="send_count-desc">Most sent</SelectItem>
            <SelectItem value="last_sent_at-desc">Recently sent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table container */}
      <div className="relative bg-surface-container border border-outline-variant overflow-hidden">
        {/* Bulk action strip */}
        {selectedIds.length > 0 && (
          <div className="bg-primary-container text-on-primary-container px-4 py-2.5 flex flex-wrap items-center gap-3">
            <span className="font-bold text-label-md">{formatNumber(selectedIds.length)} Selected</span>
            <div className="h-4 w-px bg-on-primary-container/20" />
            <Select value={bulkCategory} onValueChange={setBulkCategory}>
              <SelectTrigger className="h-7 w-44 text-xs bg-surface-container-lowest text-on-surface border-outline-variant">
                <SelectValue placeholder="Reassign category to..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
              </SelectContent>
            </Select>
            <button
              disabled={!bulkCategory || bulkCategoryMutation.isPending}
              onClick={() => bulkCategoryMutation.mutate()}
              className="flex items-center gap-1 text-label-md font-bold hover:underline disabled:opacity-50"
            >
              <Icon name="sell" className="text-sm" /> {bulkCategoryMutation.isPending ? "Applying..." : "Apply"}
            </button>
            <button onClick={() => setBulkDeleteOpen(true)} className="flex items-center gap-1 text-label-md font-bold hover:underline">
              <Icon name="delete" className="text-sm" /> Delete
            </button>
            <button onClick={() => setRowSelection({})} className="ml-auto text-on-primary-container/70 hover:text-on-primary-container">
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
                  <Checkbox checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={toggleAll} aria-label="Select all" />
                </th>
                <SortableTh col="name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Business</SortableTh>
                <SortableTh col="category" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Category</SortableTh>
                <th className="p-3 text-label-md font-label-md text-muted-text uppercase tracking-wider">Pitch</th>
                <th className="p-3 text-label-md font-label-md text-muted-text uppercase tracking-wider">Phone</th>
                <SortableTh col="status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Status</SortableTh>
                <SortableTh col="send_count" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Sent</SortableTh>
                <SortableTh col="created_at" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Imported</SortableTh>
                <th className="p-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-outline-variant">
                    {[...Array(9)].map((_, j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full max-w-[120px]" /></td>)}
                  </tr>
                ))
              ) : leads.length === 0 ? (
                <tr><td colSpan={9}>
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Icon name="search_off" className="text-4xl text-muted-text" />
                    <p className="font-semibold text-on-surface mt-3">No leads found</p>
                    <p className="text-body-sm text-muted-text mt-1">Try adjusting your filters</p>
                  </div>
                </td></tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const lead = row.original;
                  const isSelected = row.getIsSelected();
                  return (
                    <tr
                      key={lead.id}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn("border-b border-outline-variant hover:bg-surface-container-highest transition-colors group", isSelected && "bg-teal-accent/5")}
                    >
                      <td className="p-3"><Checkbox checked={isSelected} onCheckedChange={(v) => row.toggleSelected(!!v)} aria-label="Select row" /></td>
                      <td className="p-3">
                        <button onClick={() => setSelectedLead(lead)} className="font-semibold text-on-surface hover:text-primary text-left transition-colors">
                          {lead.name}
                        </button>
                        {lead.city && <p className="text-[11px] text-muted-text mt-0.5">{lead.city}</p>}
                      </td>
                      <td className="p-3 text-body-sm text-muted-text">{lead.category || "—"}</td>
                      <td className="p-3"><PitchTag pitchType={lead.pitch_type} /></td>
                      <td className="p-3 font-mono text-body-sm text-muted-text">{lead.phone_raw || lead.phone}</td>
                      <td className="p-3"><StatusBadge status={lead.status} /></td>
                      <td className="p-3 text-body-sm text-muted-text tabular">{lead.send_count > 0 ? `${lead.send_count}×` : "—"}</td>
                      <td className="p-3 text-body-sm text-muted-text">{formatDate(lead.created_at)}</td>
                      <td className="p-3 text-right">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <LeadRowActions lead={lead} onView={setSelectedLead} onDelete={handleDeleteRequest} />
                        </div>
                      </td>
                    </tr>
                  );
                })
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
              <Icon name="search_off" className="text-4xl text-muted-text" />
              <p className="font-semibold text-on-surface mt-3">No leads found</p>
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
                      <LeadRowActions lead={lead} onView={setSelectedLead} onDelete={handleDeleteRequest} />
                      <Checkbox checked={isSelected} onCheckedChange={(v) => row.toggleSelected(!!v)} aria-label="Select row" />
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-between items-center gap-2 mt-3">
                    <div className="flex items-center gap-2">
                      <PitchTag pitchType={lead.pitch_type} />
                      {lead.category && <span className="text-[11px] text-muted-text">{lead.category}</span>}
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {isFetching && !isLoading && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary">
            <Icon name="progress_activity" className="animate-spin text-sm" /> Syncing
          </div>
        )}
      </div>

      {/* Pagination */}
      <footer className="flex flex-col md:flex-row items-center justify-between gap-4 px-1">
        <div className="text-muted-text text-body-sm">
          Showing {totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalCount)} of {formatNumber(totalCount)} leads
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 border border-outline-variant hover:bg-surface-container-high transition-colors disabled:opacity-30" disabled={page === 1} onClick={() => setPage(1)}><Icon name="first_page" className="text-lg" /></button>
          <button className="p-2 border border-outline-variant hover:bg-surface-container-high transition-colors disabled:opacity-30" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><Icon name="chevron_left" className="text-lg" /></button>
          <span className="px-3 text-body-sm text-muted-text">Page {page} of {totalPages}</span>
          <button className="p-2 border border-outline-variant hover:bg-surface-container-high transition-colors disabled:opacity-30" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><Icon name="chevron_right" className="text-lg" /></button>
          <button className="p-2 border border-outline-variant hover:bg-surface-container-high transition-colors disabled:opacity-30" disabled={page >= totalPages} onClick={() => setPage(totalPages)}><Icon name="last_page" className="text-lg" /></button>
        </div>
      </footer>

      <LeadDetailsSheet
        lead={selectedLead}
        open={!!selectedLead}
        onOpenChange={(v) => !v && setSelectedLead(null)}
        onDelete={handleDeleteRequest}
      />

      <DeleteLeadDialog
        lead={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        isDeleting={deleteMutation.isPending}
      />

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {formatNumber(selectedIds.length)} leads</DialogTitle>
            <DialogDescription>This will permanently delete {formatNumber(selectedIds.length)} selected leads. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleteMutation.isPending}>Cancel</Button>
            <Button variant="destructive" onClick={() => bulkDeleteMutation.mutate()} disabled={bulkDeleteMutation.isPending}>
              {bulkDeleteMutation.isPending ? <><Icon name="progress_activity" className="animate-spin text-base" /> Deleting...</> : "Delete selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
