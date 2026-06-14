import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Send, SlidersHorizontal, Loader2, ServerOff, Search, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/use-toast";
import { formatDate, formatNumber } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import PitchTag from "@/components/PitchTag";
import SendConfirmModal from "@/components/SendConfirmModal";
import SendProgressModal from "@/components/SendProgressModal";
import ResendConfirmModal from "@/components/ResendConfirmModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export default function PendingLeadsPage() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [pitchFilter, setPitchFilter] = useState("all");
  const [sortKey, setSortKey] = useState("created_at-desc");
  const [rowSelection, setRowSelection] = useState({});

  // Range-based send controls
  const [useRange, setUseRange] = useState(false); // false = send all, true = use range
  const [rangeFrom, setRangeFrom] = useState("1");
  const [rangeTo, setRangeTo] = useState("50");

  const [templateId, setTemplateId] = useState("default");
  const [showConfirm, setShowConfirm] = useState(false);
  const [sendJobId, setSendJobId] = useState(null);
  const [resendInfo, setResendInfo] = useState(null);
  const [pendingSend, setPendingSend] = useState(null);

  const [sortBy, sortDir] = sortKey.split("-");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["leads", "pending", { page, search, pitchFilter, sortBy, sortDir }],
    queryFn: () => api.getLeads({
      status: "pending",
      page,
      pageSize: PAGE_SIZE,
      sortBy,
      sortDir,
      ...(search ? { search } : {}),
      ...(pitchFilter !== "all" ? { pitch_type: pitchFilter } : {}),
    }),
  });

  const { data: templatesData } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.getTemplates(),
  });

  const templates = templatesData?.data || [];
  const leads = data?.data || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const selectedIds = useMemo(
    () => Object.keys(rowSelection)
      .filter((k) => rowSelection[k])
      .map((idx) => leads[Number(idx)]?.id)
      .filter(Boolean),
    [rowSelection, leads],
  );

  // Compute effective range values
  const from1 = Math.max(1, parseInt(rangeFrom) || 1);
  const to1 = Math.max(from1, parseInt(rangeTo) || from1);
  const rangeCount = to1 - from1 + 1;

  // Determine what will actually be sent
  const sendCount = useMemo(() => {
    if (selectedIds.length > 0) return selectedIds.length;
    if (!useRange) return totalCount; // Send All
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

  // Toggle all visible rows
  const allChecked = leads.length > 0 && leads.every((_, i) => rowSelection[i]);
  const toggleAll = () => {
    if (allChecked) {
      setRowSelection({});
    } else {
      const next = {};
      leads.forEach((_, i) => { next[i] = true; });
      setRowSelection(next);
    }
  };

  const sendMutation = useMutation({
    mutationFn: ({ ids, confirmResend, rangeFrom: rf, rangeTo: rt }) =>
      api.sendMessages(ids, {
        confirmResend,
        templateId: templateId !== "default" ? templateId : null,
        // Pass range whenever we don't have explicit IDs (covers both Send All and Custom Range)
        ...(ids.length === 0 && rf != null ? { rangeFrom: rf, rangeTo: rt } : {}),
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
      if (err.status === 409) {
        setShowConfirm(false);
        setResendInfo({ ...err.body, leadIds: pendingSend?.ids || [] });
      } else if (err.status === 503) {
        toast({ variant: "destructive", title: "WhatsApp offline", description: err.body?.error });
      } else {
        toast({ variant: "destructive", title: "Send failed", description: err.body?.error || err.message });
      }
    },
  });

  const handleSendClick = () => {
    if (selectedIds.length > 0) {
      // Manual selection — use explicit IDs
      setPendingSend({ ids: selectedIds, count: selectedIds.length, sendAll: false });
    } else if (!useRange) {
      // Send All — use range 1 to totalCount
      setPendingSend({ ids: [], count: totalCount, sendAll: true, rangeFrom: 1, rangeTo: totalCount });
    } else {
      // Custom range
      setPendingSend({ ids: [], count: rangeCount, sendAll: false, rangeFrom: from1, rangeTo: to1 });
    }
    setShowConfirm(true);
  };

  const handleJobComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
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
      {/* Send Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Send Outreach</CardTitle>
          <CardDescription>Send to all pending leads, select a custom range, or manually check rows below</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Send Mode Toggle + Range */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Send All / Use Range toggle buttons */}
              <button
                onClick={() => { setUseRange(false); setRowSelection({}); }}
                className={cn(
                  "rounded-lg border px-4 py-2 text-xs font-semibold transition-all",
                  !useRange && !selectedIds.length
                    ? "border-teal/50 bg-teal/10 text-teal"
                    : "border-line text-ink-muted hover:border-ink-muted hover:text-ink",
                )}
              >
                Send All
              </button>
              <button
                onClick={() => { setUseRange(true); setRowSelection({}); }}
                className={cn(
                  "rounded-lg border px-4 py-2 text-xs font-semibold transition-all",
                  useRange && !selectedIds.length
                    ? "border-teal/50 bg-teal/10 text-teal"
                    : "border-line text-ink-muted hover:border-ink-muted hover:text-ink",
                )}
              >
                Custom Range
              </button>

              {selectedIds.length > 0 && (
                <button
                  onClick={() => setRowSelection({})}
                  className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink border border-line rounded-lg px-2 py-2"
                >
                  <X className="h-3 w-3" /> Clear selection ({selectedIds.length})
                </button>
              )}
            </div>

            {/* Range inputs - only visible when Custom Range is active */}
            {useRange && !selectedIds.length && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-muted">From</span>
                  <Input
                    type="number"
                    min={1}
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    className="h-8 w-20 text-xs"
                  />
                  <span className="text-xs text-ink-muted">To</span>
                  <Input
                    type="number"
                    min={1}
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    className="h-8 w-20 text-xs"
                  />
                </div>

                {/* Quick presets */}
                {[
                  { label: "1–10", from: 1, to: 10 },
                  { label: "1–50", from: 1, to: 50 },
                  { label: "1–100", from: 1, to: 100 },
                  { label: "51–100", from: 51, to: 100 },
                  { label: "101–200", from: 101, to: 200 },
                ].map((p) => (
                  <button
                    key={p.label}
                    onClick={() => { setRangeFrom(String(p.from)); setRangeTo(String(p.to)); }}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                      String(rangeFrom) === String(p.from) && String(rangeTo) === String(p.to)
                        ? "border-teal/50 bg-teal/10 text-teal"
                        : "border-line text-ink-muted hover:border-ink-muted hover:text-ink",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            {selectedIds.length > 0 && (
              <p className="text-xs text-amber">
                {formatNumber(selectedIds.length)} rows manually selected — overrides range/send all
              </p>
            )}
          </div>

          {/* Template + Action row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="w-56">
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
              <div className="rounded-lg border border-teal/20 bg-teal/5 px-4 py-2 text-center min-w-[110px]">
                <p className="text-[10px] text-ink-muted uppercase tracking-wider">Will send to</p>
                <p className="font-display text-xl font-bold text-teal tabular">{formatNumber(sendCount)}</p>
                <p className="text-[10px] text-ink-muted truncate max-w-[140px]">{sendDescription}</p>
              </div>
              <Button onClick={handleSendClick} disabled={sendCount <= 0 || sendMutation.isPending} size="lg">
                {sendMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                  : <><Send className="h-4 w-4" /> Send Messages</>
                }
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-ink-muted" />
              <CardTitle>Pending Leads</CardTitle>
              <Badge variant="secondary">{formatNumber(totalCount)}</Badge>
              {selectedIds.length > 0 && (
                <Badge variant="outline" className="border-teal/30 text-teal">{formatNumber(selectedIds.length)} selected</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
                <Input
                  placeholder="Search name, phone..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="h-8 w-full sm:w-48 text-xs pl-8"
                />
              </div>
              <Select value={pitchFilter} onValueChange={(v) => { setPitchFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="All pitches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All pitches</SelectItem>
                  <SelectItem value="POS">POS</SelectItem>
                  <SelectItem value="WEBSITE">Website</SelectItem>
                  <SelectItem value="GENERIC">General</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortKey} onValueChange={setSortKey}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at-desc">Newest first</SelectItem>
                  <SelectItem value="created_at-asc">Oldest first</SelectItem>
                  <SelectItem value="name-asc">Name A–Z</SelectItem>
                  <SelectItem value="name-desc">Name Z–A</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 mt-3">
          {isLoading ? (
            <div className="space-y-2 p-5">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-full border border-line bg-surface-2 p-5 mb-4">
                <Send className="h-7 w-7 text-ink-muted" />
              </div>
              <p className="font-semibold text-ink">No pending leads</p>
              <p className="text-sm text-ink-muted mt-1 mb-4">Import a CSV to build your outreach queue</p>
              <Link to="/import"><Button variant="outline" size="sm">Import CSV</Button></Link>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allChecked}
                        onCheckedChange={toggleAll}
                        aria-label="Select all visible"
                      />
                    </TableHead>
                    <TableHead>#</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Pitch</TableHead>
                    <TableHead>Imported</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead, i) => {
                    const globalIdx = (page - 1) * PAGE_SIZE + i + 1;
                    const inRange = useRange && !selectedIds.length && globalIdx >= from1 && globalIdx <= to1;
                    return (
                      <TableRow
                        key={lead.id}
                        data-state={rowSelection[i] ? "selected" : undefined}
                        className={cn(inRange && !rowSelection[i] ? "bg-teal/5" : "")}
                      >
                        <TableCell>
                          <Checkbox
                            checked={!!rowSelection[i]}
                            onCheckedChange={(v) => setRowSelection((prev) => ({ ...prev, [i]: !!v }))}
                          />
                        </TableCell>
                        <TableCell>
                          <span className={cn("text-xs font-mono", inRange ? "text-teal font-semibold" : "text-ink-muted")}>
                            {globalIdx}
                          </span>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-ink">{lead.name}</p>
                          {lead.category && <p className="text-xs text-ink-muted">{lead.category}</p>}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-ink-muted">{lead.phone_raw || lead.phone}</span>
                        </TableCell>
                        <TableCell><PitchTag pitchType={lead.pitch_type} /></TableCell>
                        <TableCell>
                          <span className="text-xs text-ink-muted">{formatDate(lead.created_at)}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t border-line px-5 py-3">
                <p className="text-xs text-ink-muted">
                  Page {page} of {totalPages} · {formatNumber(totalCount)} pending
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
        estimatedSeconds={(pendingSend?.count || sendCount) * 8}
        isSending={sendMutation.isPending}
      />

      <SendProgressModal
        jobId={sendJobId}
        onClose={() => setSendJobId(null)}
        onComplete={handleJobComplete}
      />

      <ResendConfirmModal
        info={resendInfo}
        onConfirm={() => sendMutation.mutate({ ids: resendInfo.leadIds, confirmResend: true })}
        onCancel={() => setResendInfo(null)}
        isSending={sendMutation.isPending}
      />
    </div>
  );
}
