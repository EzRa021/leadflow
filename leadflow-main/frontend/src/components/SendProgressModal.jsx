import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, Square, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import StatusBadge from "./StatusBadge";
import { formatNumber } from "@/lib/format";
import { toast } from "@/lib/use-toast";

function MiniStat({ label, value, colorClass }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-center">
      <p className={`font-display text-xl font-bold tabular ${colorClass}`}>{formatNumber(value ?? 0)}</p>
      <p className="text-[10px] uppercase tracking-wide text-ink-muted mt-0.5">{label}</p>
    </div>
  );
}

export default function SendProgressModal({ jobId, onClose, onComplete }) {
  const queryClient = useQueryClient();

  const { data: job } = useQuery({
    queryKey: ["send-job", jobId],
    queryFn: () => api.getSendJob(jobId),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "done" || status === "stopped") return false;
      return 1500;
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopSendJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["send-job", jobId] });
      toast({ variant: "default", title: "Stop requested", description: "Finishing current message then stopping..." });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Could not stop", description: err.message });
    },
  });

  const status = job?.status;
  const isDone = status === "done";
  const isStopped = status === "stopped";
  const isStopping = status === "stopping";
  const isFinished = isDone || isStopped;

  // Fire onComplete when the job reaches ANY terminal state, not just "done".
  // A manually-stopped job has already sent/failed/skipped some leads
  // server-side, so its caller still needs to refresh the leads/stats caches —
  // otherwise the Pending/Sent tables show stale rows until staleTime lapses.
  useEffect(() => {
    if (isFinished && onComplete) onComplete(job);
  }, [isFinished, job, onComplete]);

  if (!jobId) return null;

  const processed = (job?.sent || 0) + (job?.failed || 0) + (job?.skipped || 0);
  const total = job?.total || 0;
  const progress = total ? (processed / total) * 100 : 0;

  function getTitleContent() {
    if (isDone) return <><CheckCircle2 className="h-5 w-5 text-teal" /> Outreach Complete</>;
    if (isStopped) return <><XCircle className="h-5 w-5 text-amber" /> Sending Stopped</>;
    if (isStopping) return <><RefreshCw className="h-5 w-5 animate-spin text-amber" /> Stopping...</>;
    return <><RefreshCw className="h-5 w-5 animate-spin text-teal" /> Sending Messages...</>;
  }

  return (
    <Dialog open onOpenChange={isFinished ? onClose : undefined}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getTitleContent()}
          </DialogTitle>
          {job?.templateName && (
            <DialogDescription>Template: {job.templateName}</DialogDescription>
          )}
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-ink-muted">
              <span>{formatNumber(processed)} of {formatNumber(total)} processed</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className={isStopped ? "opacity-60" : ""} />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <MiniStat label="Sent"    value={job?.sent}      colorClass="text-teal" />
            <MiniStat label="Failed"  value={job?.failed}    colorClass="text-rose" />
            <MiniStat label="Skipped" value={job?.skipped}   colorClass="text-amber" />
            <MiniStat label="Left"    value={job?.remaining} colorClass="text-ink-muted" />
          </div>

          <div className="max-h-52 overflow-y-auto rounded-lg border border-line bg-surface-2 divide-y divide-line">
            {!job?.log?.length ? (
              <div className="px-4 py-8 text-center text-sm text-ink-muted">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-teal/50" />
                Waiting for first result...
              </div>
            ) : (
              [...job.log].reverse().map((entry, i) => (
                <div key={`${entry.phone}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-ink truncate">{entry.name}</p>
                    <p className="font-mono text-ink-muted">{entry.phone}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <StatusBadge status={entry.status} />
                    {entry.note && <p className="mt-0.5 text-ink-muted max-w-[130px] truncate">{entry.note}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          {isFinished ? (
            <Button onClick={onClose} className="ml-auto">
              Done
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${isStopping ? "bg-amber animate-pulse" : "bg-teal animate-pulse"}`} />
                {isStopping ? "Stopping after current message..." : `Live · ${formatNumber(processed)} / ${formatNumber(total)}`}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-rose/40 text-rose hover:bg-rose/10 hover:border-rose/60 shrink-0"
                onClick={() => stopMutation.mutate()}
                disabled={isStopping || stopMutation.isPending}
              >
                <Square className="h-3 w-3 mr-1.5 fill-current" />
                {isStopping ? "Stopping..." : "Stop Sending"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
