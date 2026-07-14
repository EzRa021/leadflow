import { useCallback, useRef, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, X, AlertCircle, Send, RefreshCw, ChevronRight,
  CheckCircle2, ArrowRight, Loader2, Download,
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
import { MATCH_VARIANT, MATCH_LABEL } from "@/lib/leadBadges";
import { Icon } from "@/components/ui/icon";

const STEPS = ["Upload CSV", "Review & Confirm", "Send Batch"];

export default function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const filenameRef = useRef("");

  // Importing and sending both mutate server data that other pages cache
  // (leads lists, category list, dashboard stats/analytics). ImportPage
  // previously invalidated none of it, so Pending/All-Leads/Dashboard showed
  // stale counts after an import until their staleTime elapsed.
  const invalidateLeadData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
  }, [queryClient]);

  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Column mapping (Tier 3 #11) — shown when a CSV doesn't use the default
  // Google Maps export column names, so the user can map their own headers
  // to LeadFlow fields instead of pre-processing the file.
  const [pendingFile, setPendingFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [showMapper, setShowMapper] = useState(false);
  const MAP_LABELS = {
    title: "Business name", phone: "Phone number", email: "Email", company: "Company",
    categoryName: "Category", city: "City", state: "State", street: "Street",
    website: "Website", totalScore: "Rating", reviewsCount: "Reviews count", url: "Maps URL",
  };
  const REQUIRED_MAP_FIELDS = ["title", "phone"];

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

  const { data: activeJobData } = useQuery({
    queryKey: ["send-job", "active"],
    queryFn: api.getActiveSendJob,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (activeJobData?.job?.id) {
      setSendJobId(activeJobData.job.id);
    }
  }, [activeJobData]);

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

  const mappedPreviewMutation = useMutation({
    mutationFn: ({ file, mapping }) => api.previewImportWithMapping(file, mapping),
    onSuccess: (data) => {
      setShowMapper(false);
      setPendingFile(null);
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
      invalidateLeadData();

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
    mutationFn: ({ leadIds, confirmResend }) =>
      api.sendMessages(leadIds, {
        confirmResend,
        templateId: templateId !== "default" ? templateId : null,
      }),
    onSuccess: (res) => {
      setResendInfo(null);
      setSendJobId(res.jobId);
      toast({ variant: "success", title: "Sending started", description: `Outreach to ${formatNumber(res.total)} leads` });
    },
    onError: (err) => {
      // Same 409-resend flow as PendingLeadsPage: the backend returns the
      // resolved leadIds in the 409 body, so we read them back off the error.
      // Only the resend prompt carries requiresConfirmation — a plain 409
      // (e.g. the overlapping-active-job guard) falls through to a toast.
      if (err.status === 409 && err.body?.requiresConfirmation) {
        setResendInfo(err.body);
      } else if (err.status === 503) {
        toast({ variant: "destructive", title: "WhatsApp offline", description: err.body?.error });
      } else {
        toast({ variant: "destructive", title: "Send failed", description: err.body?.error || err.message });
      }
    },
  });

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast({ variant: "destructive", title: "Invalid file", description: "Please upload a CSV file" });
      return;
    }
    filenameRef.current = file.name;

    // Sniff headers first — if the file already uses the standard Google Maps
    // export column names, skip straight to preview. Otherwise show the mapper.
    try {
      const { headers, hasStandardColumns } = await api.getCsvHeaders(file);
      if (hasStandardColumns) {
        previewMutation.mutate(file);
      } else {
        setCsvHeaders(headers);
        setColumnMapping({});
        setPendingFile(file);
        setShowMapper(true);
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Import failed", description: err.message || "Could not read CSV" });
    }
  }, [previewMutation]);

  const handleMapperContinue = () => {
    if (!pendingFile) return;
    mappedPreviewMutation.mutate({ file: pendingFile, mapping: columnMapping });
  };

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
    setShowMapper(false);
    setPendingFile(null);
    setCsvHeaders([]);
    setColumnMapping({});
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
    // Send by explicit ids from the just-imported batch (in insertion order).
    // This intentionally does NOT use the backend range helper that
    // PendingLeadsPage uses — that helper ranges over ALL pending leads with
    // filters/sort, which would send the wrong rows here. The imported batch
    // is a specific id set, so explicit ids (validated + resend-checked
    // server-side by id) are the correct mechanism for this flow.
    const leads = importResult?.inserted || [];
    const selected = useRange ? leads.slice(from1 - 1, to1) : leads;
    const ids = selected.map((l) => l.id);
    sendMutation.mutate({ leadIds: ids, confirmResend: false });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface">Import &amp; Send</h2>
        <p className="text-muted-text text-body-sm mt-1">Upload a Google Maps CSV, review the leads, then send outreach.</p>
      </div>

      {/* Step indicator */}
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn(
              "flex h-6 w-6 items-center justify-center text-xs font-bold border transition-all",
              i < step ? "border-teal-accent bg-teal-accent text-white" : i === step ? "border-teal-accent text-teal-accent bg-teal-accent/10" : "border-outline-variant text-muted-text"
            )}>
              {i < step ? <Icon name="check" className="text-sm" /> : i + 1}
            </div>
            <span className={cn("text-body-sm font-medium", i === step ? "text-on-surface" : "text-muted-text")}>{label}</span>
            {i < STEPS.length - 1 && <Icon name="chevron_right" className="text-lg text-muted-text" />}
          </div>
        ))}
      </div>

      {/* ───── STEP 0: COLUMN MAPPING ───── */}
      {step === 0 && showMapper && (
        <Card>
          <CardHeader>
            <CardTitle>Map Your Columns</CardTitle>
            <CardDescription>
              This CSV doesn't use the default Google Maps export headers. Match your columns to LeadFlow fields below.
              Business name and Phone number are required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(MAP_LABELS).map(([field, label]) => (
                <div key={field} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-muted shrink-0">
                    {label}
                    {REQUIRED_MAP_FIELDS.includes(field) && <span className="text-rose"> *</span>}
                  </span>
                  <Select
                    value={columnMapping[field] || "__none"}
                    onValueChange={(v) => setColumnMapping((m) => ({ ...m, [field]: v === "__none" ? undefined : v }))}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Not mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Not mapped</SelectItem>
                      {csvHeaders.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-line pt-4">
              <Button variant="ghost" size="sm" onClick={resetAll}><X className="h-4 w-4 mr-1" /> Cancel</Button>
              <Button
                size="sm"
                onClick={handleMapperContinue}
                disabled={mappedPreviewMutation.isPending || REQUIRED_MAP_FIELDS.some((f) => !columnMapping[f])}
              >
                {mappedPreviewMutation.isPending
                  ? <><RefreshCw className="h-4 w-4 animate-spin mr-1" /> Parsing...</>
                  : <><ChevronRight className="h-4 w-4 mr-1" /> Continue</>
                }
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───── STEP 0: UPLOAD ───── */}
      {step === 0 && !showMapper && (
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
                  <Icon name="sync" className="text-4xl text-teal-accent animate-spin" />
                  <p className="text-sm text-ink-muted">Parsing your CSV...</p>
                </div>
              ) : (
                <>
                  <div className="border border-outline-variant bg-surface-container-high p-5 mb-4">
                    <Icon name="cloud_upload" className="text-4xl text-muted-text" />
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Total", value: preview.counts.total, cls: "text-ink" },
              { label: "New", value: preview.counts.new, cls: "text-teal" },
              { label: "Existing", value: preview.counts.existing, cls: "text-amber" },
              { label: "Contacted", value: preview.counts.contacted, cls: "text-rose" },
                { label: "Possible dupes", value: preview.counts.possibleDuplicates || 0, cls: "text-amber" },
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

          {preview.rejectedCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber/30 bg-amber/5 px-4 py-3">
              <div className="flex gap-3">
                <AlertCircle className="h-4 w-4 text-amber shrink-0 mt-0.5" />
                <p className="text-sm text-ink-muted">
                  <strong className="text-ink">{formatNumber(preview.rejectedCount)} rows</strong> were skipped
                  during parsing (missing or unreadable phone numbers) and won't be imported.
                </p>
              </div>
              <a href={api.rejectedCsvUrl(preview.batchId)} download>
                <Button variant="outline" size="sm">
                  <Download className="h-3.5 w-3.5 mr-1" /> Download rejected rows
                </Button>
              </a>
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
                          <div className="flex items-center gap-1.5">
                            <Badge variant={MATCH_VARIANT[row.matchType] || "secondary"}>
                              {MATCH_LABEL[row.matchType] || row.matchType}
                            </Badge>
                            {row.possibleDuplicate && (
                              <span
                                title={`Similar to "${row.possibleDuplicate.matchedName || "another row"}" (${row.possibleDuplicate.matchedPhone}) — possible duplicate business`}
                                className="inline-flex items-center gap-0.5 rounded border border-amber/40 bg-amber/10 px-1.5 py-0.5 text-[10px] font-medium text-amber"
                              >
                                <AlertCircle className="h-2.5 w-2.5" /> possible dup
                              </span>
                            )}
                          </div>
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
        onComplete={invalidateLeadData}
      />
    </div>
  );
}
