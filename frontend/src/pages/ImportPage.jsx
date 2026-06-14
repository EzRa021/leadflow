import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileText, X, AlertCircle, Send, RefreshCw, ChevronRight,
  CheckCircle2, ArrowRight, Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/use-toast";
import { formatNumber } from "@/lib/format";
import DuplicateImportModal from "@/components/DuplicateImportModal";
import ResendConfirmModal from "@/components/ResendConfirmModal";
import SendProgressModal from "@/components/SendProgressModal";
import PitchTag from "@/components/PitchTag";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const MATCH_VARIANT = { new: "success", existing: "warning", contacted: "destructive" };
const MATCH_LABEL = { new: "New", existing: "Existing", contacted: "Contacted" };

const STEPS = ["Upload CSV", "Review & Confirm", "Send Batch"];

export default function ImportPage() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const filenameRef = useRef("");

  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Send step state
  const [useRange, setUseRange] = useState(false); // false = send all, true = custom range
  const [rangeFrom, setRangeFrom] = useState("1");
  const [rangeTo, setRangeTo] = useState("50");
  const [templateId, setTemplateId] = useState("default");
  const [sendJobId, setSendJobId] = useState(null);
  const [resendInfo, setResendInfo] = useState(null);

  const { data: templatesData } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.getTemplates(),
  });
  const templates = templatesData?.data || [];

  const previewMutation = useMutation({
    mutationFn: api.previewImport,
    onSuccess: (data) => {
      setPreview({ ...data, filename: filenameRef.current });
      setStep(1);
      toast({ variant: "success", title: "CSV parsed", description: `${formatNumber(data.counts.total)} leads ready for review` });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Import failed", description: err.message || "Could not parse CSV" });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: ({ batchId, mode }) => api.confirmImport(batchId, mode),
    onSuccess: (data) => {
      setShowDuplicateModal(false);
      setImportResult(data);

      const insertedCount = data.insertedCount || 0;
      if (insertedCount > 0) {
        setRangeFrom("1");
        setRangeTo(String(insertedCount));
      }

      // Default to Send All for the newly imported batch
      setUseRange(false);
      setStep(2);
      toast({
        variant: "success",
        title: "Import complete",
        description: `${formatNumber(data.insertedCount)} leads added to pending queue`,
      });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Import failed", description: err.message });
    },
  });

  const sendMutation = useMutation({
    mutationFn: ({ leadIds, confirmResend, rangeFrom: rf, rangeTo: rt }) =>
      api.sendMessages(leadIds, {
        confirmResend,
        templateId: templateId !== "default" ? templateId : null,
        // Always pass range for imported leads (range based on all pending, but
        // the user chose which slice to send)
        ...(leadIds.length === 0 && rf != null ? { rangeFrom: rf, rangeTo: rt } : {}),
      }),
    onSuccess: (res) => {
      setResendInfo(null);
      setSendJobId(res.jobId);
      toast({ variant: "success", title: "Sending started", description: `Outreach to ${formatNumber(res.total)} leads` });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Send failed", description: err.body?.error || err.message });
    },
  });

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast({ variant: "destructive", title: "Invalid file", description: "Please upload a CSV file" });
      return;
    }
    filenameRef.current = file.name;
    previewMutation.mutate(file);
  }, [previewMutation]);

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleConfirmClick = () => {
    const hasDupes = preview.counts.existing + preview.counts.contacted > 0;
    if (hasDupes) {
      setShowDuplicateModal(true);
    } else {
      confirmMutation.mutate({ batchId: preview.batchId, mode: "new_only" });
    }
  };

  const resetAll = () => {
    setPreview(null);
    setImportResult(null);
    setStep(0);
    setSendJobId(null);
    setResendInfo(null);
    setUseRange(false);
    filenameRef.current = "";
    setShowDuplicateModal(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const from1 = Math.max(1, parseInt(rangeFrom) || 1);
  const to1 = Math.max(from1, parseInt(rangeTo) || from1);
  const rangeCount = to1 - from1 + 1;
  const insertedCount = importResult?.insertedCount || 0;

  // Effective send count
  const sendCount = !useRange ? insertedCount : Math.min(rangeCount, insertedCount);
  const sendDescription = !useRange
    ? `all ${formatNumber(insertedCount)} imported`
    : `leads #${from1}–${to1} (${formatNumber(rangeCount)})`;

  const handleSendClick = () => {
    if (!useRange) {
      // Send All — pass range 1 to insertedCount
      sendMutation.mutate({ leadIds: [], confirmResend: false, rangeFrom: 1, rangeTo: insertedCount });
    } else {
      // Custom range
      sendMutation.mutate({ leadIds: [], confirmResend: false, rangeFrom: from1, rangeTo: to1 });
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 animate-fade-in">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold border transition-all",
              i < step ? "border-teal bg-teal text-white" : i === step ? "border-teal text-teal bg-teal/10" : "border-line text-ink-muted"
            )}>
              {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn("text-sm font-medium", i === step ? "text-ink" : "text-ink-muted")}>{label}</span>
            {i < STEPS.length - 1 && <ArrowRight className="h-4 w-4 text-ink-muted" />}
          </div>
        ))}
      </div>

      {/* ───── STEP 0: UPLOAD ───── */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload CSV</CardTitle>
            <CardDescription>
              Leads are not saved until you confirm the import
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 transition-all cursor-pointer",
                isDragging ? "border-teal bg-teal/5" : "border-line bg-surface-2/30 hover:border-ink-muted hover:bg-surface-2/60"
              )}
              onClick={() => !previewMutation.isPending && fileRef.current?.click()}
            >
              {previewMutation.isPending ? (
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="h-10 w-10 text-teal animate-spin" />
                  <p className="text-sm text-ink-muted">Parsing your CSV...</p>
                </div>
              ) : (
                <>
                  <div className="rounded-full border border-line bg-surface-2 p-5 mb-4">
                    <Upload className="h-8 w-8 text-ink-muted" />
                  </div>
                  <p className="text-base font-medium text-ink">Drop your CSV here</p>
                  <p className="mt-1 text-sm text-ink-muted">Supports Google Maps export format with phone numbers</p>
                  <Button variant="outline" className="mt-5" size="sm">Browse files</Button>
                  <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
                </>
              )}
            </div>
            <div className="mt-4 rounded-lg border border-line bg-surface-2/50 px-4 py-3">
              <p className="text-xs font-medium text-ink-muted mb-1">Expected CSV columns:</p>
              <code className="text-xs font-mono text-ink-muted">
                title, phone, email, company, categoryName, city, state, street, website, url
              </code>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───── STEP 1: PREVIEW & CONFIRM ───── */}
      {step === 1 && preview && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-lg border border-line bg-surface-2 p-2 shrink-0">
                <FileText className="h-4 w-4 text-ink-muted" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold text-ink leading-none truncate">{preview.filename}</h2>
                <p className="text-xs text-ink-muted mt-0.5">{formatNumber(preview.counts.total)} leads parsed · review before confirming</p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={resetAll}><X className="h-4 w-4 mr-1" /> Cancel</Button>
              <Button size="sm" onClick={handleConfirmClick} disabled={confirmMutation.isPending}>
                {confirmMutation.isPending
                  ? <><RefreshCw className="h-4 w-4 animate-spin mr-1" /> Importing...</>
                  : <><ChevronRight className="h-4 w-4 mr-1" /> Confirm Import</>
                }
              </Button>
            </div>
          </div>

          {/* Count cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total", value: preview.counts.total, cls: "text-ink" },
              { label: "New", value: preview.counts.new, cls: "text-teal" },
              { label: "Existing", value: preview.counts.existing, cls: "text-amber" },
              { label: "Contacted", value: preview.counts.contacted, cls: "text-rose" },
            ].map((s) => (
              <Card key={s.label} className="px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">{s.label}</p>
                <p className={`mt-1 font-display text-2xl font-bold tabular ${s.cls}`}>{formatNumber(s.value)}</p>
              </Card>
            ))}
          </div>

          {preview.counts.contacted > 0 && (
            <div className="flex gap-3 rounded-lg border border-rose/30 bg-rose/5 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-rose shrink-0 mt-0.5" />
              <p className="text-sm text-ink-muted">
                <strong className="text-ink">{formatNumber(preview.counts.contacted)} leads</strong> already contacted.
                After import, you can choose to resend to them or skip.
              </p>
            </div>
          )}

          {/* Preview table */}
          <Card>
            <CardHeader className="pb-0">
              <CardTitle>Preview ({formatNumber(preview.rows.length)} rows)</CardTitle>
            </CardHeader>
            <CardContent className="p-0 mt-3">
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Pitch</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Match</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row, i) => (
                      <TableRow key={row.phone}>
                        <TableCell className="text-xs font-mono text-ink-muted">{i + 1}</TableCell>
                        <TableCell>
                          <p className="font-medium text-ink">{row.name}</p>
                          {row.email && <p className="text-xs text-ink-muted mt-0.5">{row.email}</p>}
                        </TableCell>
                        <TableCell><span className="font-mono text-xs text-ink-muted">{row.phone_raw || row.phone}</span></TableCell>
                        <TableCell><span className="text-sm text-ink-muted">{row.category || "—"}</span></TableCell>
                        <TableCell><PitchTag pitchType={row.pitch_type} /></TableCell>
                        <TableCell><span className="text-sm text-ink-muted">{row.city || "—"}</span></TableCell>
                        <TableCell>
                          <Badge variant={MATCH_VARIANT[row.matchType] || "secondary"}>
                            {MATCH_LABEL[row.matchType] || row.matchType}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ───── STEP 2: SEND ───── */}
      {step === 2 && importResult && (
        <>
          {/* Import summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card className="px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Inserted</p>
              <p className="mt-1 font-display text-2xl font-bold text-teal tabular">{formatNumber(importResult.insertedCount)}</p>
            </Card>
            <Card className="px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Skipped</p>
              <p className="mt-1 font-display text-2xl font-bold text-ink-muted tabular">{formatNumber(importResult.skippedCount)}</p>
            </Card>
            <Card className="px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Contacted leads</p>
              <p className="mt-1 font-display text-2xl font-bold text-amber tabular">
                {formatNumber(importResult.contactedLeads?.length || 0)}
              </p>
            </Card>
          </div>

          {/* Send controls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Send to Imported Leads</CardTitle>
              <CardDescription>
                Send messages to the {formatNumber(insertedCount)} newly imported leads
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Send Mode toggle + range inputs */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setUseRange(false)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-xs font-semibold transition-all",
                      !useRange
                        ? "border-teal/50 bg-teal/10 text-teal"
                        : "border-line text-ink-muted hover:border-ink-muted hover:text-ink",
                    )}
                  >
                    Send All ({formatNumber(insertedCount)})
                  </button>
                  <button
                    onClick={() => setUseRange(true)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-xs font-semibold transition-all",
                      useRange
                        ? "border-teal/50 bg-teal/10 text-teal"
                        : "border-line text-ink-muted hover:border-ink-muted hover:text-ink",
                    )}
                  >
                    Custom Range
                  </button>
                </div>

                {/* Range inputs — only when Custom Range is active */}
                {useRange && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-muted">From</span>
                      <Input
                        type="number"
                        min={1}
                        max={insertedCount}
                        value={rangeFrom}
                        onChange={(e) => setRangeFrom(e.target.value)}
                        className="h-8 w-20 text-xs"
                      />
                      <span className="text-xs text-ink-muted">To</span>
                      <Input
                        type="number"
                        min={1}
                        max={insertedCount}
                        value={rangeTo}
                        onChange={(e) => setRangeTo(e.target.value)}
                        className="h-8 w-20 text-xs"
                      />
                    </div>
                    {/* Quick presets */}
                    {[
                      { label: "All", from: 1, to: insertedCount },
                      { label: "1–50", from: 1, to: Math.min(50, insertedCount) },
                      { label: "1–100", from: 1, to: Math.min(100, insertedCount) },
                      { label: "51–100", from: 51, to: Math.min(100, insertedCount) },
                    ].filter((p) => p.from <= insertedCount).map((p) => (
                      <button
                        key={p.label}
                        onClick={() => { setRangeFrom(String(p.from)); setRangeTo(String(p.to)); }}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                          String(rangeFrom) === String(p.from) && String(rangeTo) === String(p.to)
                            ? "border-teal/50 bg-teal/10 text-teal"
                            : "border-line text-ink-muted hover:border-ink-muted hover:text-ink"
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Template selector + send count + send button — aligned in one row */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-line pt-4">
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
                  <Button
                    size="lg"
                    onClick={handleSendClick}
                    disabled={sendCount <= 0 || sendMutation.isPending || insertedCount === 0}
                  >
                    {sendMutation.isPending
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Sending...</>
                      : <><Send className="h-4 w-4 mr-1" /> Send Now</>
                    }
                  </Button>
                </div>
              </div>

              {/* Navigation links */}
              <div className="flex gap-2 border-t border-line pt-3">
                <Button variant="outline" size="sm" onClick={() => navigate("/pending")}>
                  Go to Pending Leads
                </Button>
                <Button variant="ghost" size="sm" onClick={resetAll}>
                  Import another CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Imported leads table */}
          {importResult.inserted && importResult.inserted.length > 0 && (
            <Card>
              <CardHeader className="pb-0">
                <CardTitle>Imported Leads ({formatNumber(importResult.inserted.length)})</CardTitle>
              </CardHeader>
              <CardContent className="p-0 mt-3">
                <div className="overflow-auto max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Business</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Pitch</TableHead>
                        <TableHead>City</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResult.inserted.map((lead, i) => {
                        const inRange = useRange && i + 1 >= from1 && i + 1 <= to1;
                        return (
                          <TableRow key={lead.id} className={cn(useRange && inRange ? "bg-teal/5" : "")}>
                            <TableCell className={cn("text-xs font-mono", useRange && inRange ? "text-teal font-semibold" : "text-ink-muted")}>
                              {i + 1}
                            </TableCell>
                            <TableCell>
                              <p className="font-medium text-ink">{lead.name}</p>
                              {lead.email && <p className="text-xs text-ink-muted">{lead.email}</p>}
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-xs text-ink-muted">{lead.phone_raw || lead.phone}</span>
                            </TableCell>
                            <TableCell><PitchTag pitchType={lead.pitch_type} /></TableCell>
                            <TableCell><span className="text-sm text-ink-muted">{lead.city || "—"}</span></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ───── MODALS ───── */}
      {showDuplicateModal && (
        <DuplicateImportModal
          preview={preview}
          onClose={() => setShowDuplicateModal(false)}
          onConfirm={(mode) => confirmMutation.mutate({ batchId: preview.batchId, mode })}
          isConfirming={confirmMutation.isPending}
        />
      )}

      <ResendConfirmModal
        info={resendInfo}
        onConfirm={() => sendMutation.mutate({ leadIds: resendInfo.leadIds, confirmResend: true })}
        onCancel={() => { setResendInfo(null); navigate("/pending"); }}
        isSending={sendMutation.isPending}
      />

      <SendProgressModal
        jobId={sendJobId}
        onClose={() => { setSendJobId(null); navigate("/pending"); }}
        onComplete={() => { }}
      />
    </div>
  );
}
