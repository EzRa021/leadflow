import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Trash2, SlidersHorizontal, ServerOff,
  ExternalLink, Phone, Mail, Globe, MapPin, RefreshCw, Search, X
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/use-toast";
import { formatDate, formatNumber } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import PitchTag from "@/components/PitchTag";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

function LeadDetailModal({ lead, onClose, onDelete }) {
  if (!lead) return null;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate">{lead.name}</DialogTitle>
          <DialogDescription>Full lead details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 py-2">
          {/* Status + Pitch */}
          <div className="flex items-center gap-2">
            <StatusBadge status={lead.status} />
            <PitchTag pitchType={lead.pitch_type} />
            {lead.send_count > 0 && (
              <Badge variant="secondary">Sent {lead.send_count}×</Badge>
            )}
          </div>

          {/* Contact info */}
          <div className="space-y-2 rounded-lg border border-line bg-surface-2/50 p-3 text-sm">
            <div className="flex items-center gap-2 text-ink-muted">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span className="font-mono text-xs">{lead.phone_raw || lead.phone}</span>
            </div>
            {lead.email && (
              <div className="flex items-center gap-2 text-ink-muted">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs">{lead.email}</span>
              </div>
            )}
            {lead.website && (
              <div className="flex items-center gap-2 text-ink-muted">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                <a href={lead.website} target="_blank" rel="noreferrer" className="text-xs text-teal hover:underline truncate">{lead.website}</a>
              </div>
            )}
            {(lead.city || lead.state) && (
              <div className="flex items-center gap-2 text-ink-muted">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs">{[lead.street, lead.city, lead.state].filter(Boolean).join(", ")}</span>
              </div>
            )}
          </div>

          {/* Category & scores */}
          {lead.category && (
            <div className="text-xs text-ink-muted">
              <span className="font-medium text-ink">Category:</span> {lead.category}
            </div>
          )}
          {lead.total_score != null && (
            <div className="text-xs text-ink-muted">
              <span className="font-medium text-ink">Rating:</span> {lead.total_score} · {lead.reviews_count ?? 0} reviews
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-2 text-xs text-ink-muted">
            <div>
              <p className="font-medium text-ink">Imported</p>
              <p>{formatDate(lead.created_at)}</p>
            </div>
            {lead.last_sent_at && (
              <div>
                <p className="font-medium text-ink">Last sent</p>
                <p>{formatDate(lead.last_sent_at)}</p>
              </div>
            )}
          </div>

          {lead.last_error && (
            <div className="rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-xs text-rose">
              <span className="font-medium">Last error:</span> {lead.last_error}
            </div>
          )}

          {lead.maps_url && (
            <a href={lead.maps_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-teal hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> View on Google Maps
            </a>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="destructive" size="sm" onClick={() => onDelete(lead)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmModal({ lead, onClose, onConfirm, isDeleting }) {
  if (!lead) return null;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Lead</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{lead.name}</strong>? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isDeleting}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> Deleting...</> : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AllLeadsPage() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pitchFilter, setPitchFilter] = useState("all");
  const [sortKey, setSortKey] = useState("created_at-desc");
  const [selectedLead, setSelectedLead] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [sortBy, sortDir] = sortKey.split("-");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["leads", "all", { page, search, statusFilter, pitchFilter, sortBy, sortDir }],
    queryFn: () => api.getLeads({
      page,
      pageSize: PAGE_SIZE,
      sortBy,
      sortDir,
      ...(search ? { search } : {}),
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      ...(pitchFilter !== "all" ? { pitch_type: pitchFilter } : {}),
    }),
  });

  const leads = data?.data || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const deleteMutation = useMutation({
    mutationFn: (id) => api.deleteLead(id),
    onSuccess: () => {
      toast({ variant: "success", title: "Lead deleted" });
      setDeleteTarget(null);
      setSelectedLead(null);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Delete failed", description: err.message });
    },
  });

  const handleDeleteRequest = (lead) => {
    setSelectedLead(null);
    setDeleteTarget(lead);
  };

  if (isError) return (
    <Card className="p-16 text-center">
      <ServerOff className="h-10 w-10 text-rose mx-auto mb-3" />
      <p className="font-semibold text-ink">Could not load leads</p>
      <p className="text-sm text-ink-muted mt-1 mb-4">Check backend connection and try again</p>
      <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["leads"] })}>Retry</Button>
    </Card>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <Card>
        <CardHeader className="pb-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-ink-muted" />
              <CardTitle>All Leads</CardTitle>
              <Badge variant="secondary">{formatNumber(totalCount)}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
                <Input
                  placeholder="Search name, phone..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="h-8 w-full sm:w-52 text-xs pl-8"
                />
                {search && (
                  <button onClick={() => { setSearch(""); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Status filter */}
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                  <SelectItem value="replied">Replied</SelectItem>
                </SelectContent>
              </Select>

              {/* Pitch filter */}
              <Select value={pitchFilter} onValueChange={(v) => { setPitchFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="All pitches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All pitches</SelectItem>
                  <SelectItem value="POS">POS</SelectItem>
                  <SelectItem value="WEBSITE">Website</SelectItem>
                  <SelectItem value="GENERIC">General</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort */}
              <Select value={sortKey} onValueChange={setSortKey}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
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
          </div>
        </CardHeader>

        <CardContent className="p-0 mt-3">
          {isLoading ? (
            <div className="space-y-2 p-5">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="font-semibold text-ink">No leads found</p>
              <p className="text-sm text-ink-muted mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Pitch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Imported</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className="cursor-pointer hover:bg-surface-2/60"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <TableCell>
                        <p className="font-medium text-ink">{lead.name}</p>
                        {lead.city && <p className="text-xs text-ink-muted">{lead.city}</p>}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-ink-muted">{lead.phone_raw || lead.phone}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-ink-muted">{lead.category || "—"}</span>
                      </TableCell>
                      <TableCell><PitchTag pitchType={lead.pitch_type} /></TableCell>
                      <TableCell><StatusBadge status={lead.status} /></TableCell>
                      <TableCell>
                        <span className="text-xs text-ink-muted">
                          {lead.send_count > 0 ? `${lead.send_count}×` : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-ink-muted">{formatDate(lead.created_at)}</span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-ink-muted hover:text-rose"
                          onClick={() => handleDeleteRequest(lead)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t border-line px-5 py-3">
                <p className="text-xs text-ink-muted">
                  Page {page} of {totalPages} · {formatNumber(totalCount)} leads
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <LeadDetailModal
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onDelete={handleDeleteRequest}
      />

      <DeleteConfirmModal
        lead={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
