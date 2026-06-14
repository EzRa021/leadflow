import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import StatusBadge from "./StatusBadge";
import { formatNumber } from "@/lib/format";

function MiniStat({ label, value, colorClass }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-center">
      <p className={`font-display text-xl font-bold tabular ${colorClass}`}>{formatNumber(value ?? 0)}</p>
      <p className="text-[10px] uppercase tracking-wide text-ink-muted mt-0.5">{label}</p>
    </div>
  );
}

export default function SendProgressModal({ jobId, onClose, onComplete }) {
  const { data: job } = useQuery({
    queryKey: ["send-job", jobId],
    queryFn: () => api.getSendJob(jobId),
    enabled: !!jobId,
    refetchInterval: (query) => query.state.data?.status === "done" ? false : 1500,
  });

  useEffect(() => {
    if (job?.status === "done" && onComplete) onComplete(job);
  }, [job, onComplete]);

  if (!jobId) return null;

  const processed = (job?.sent || 0) + (job?.failed || 0) + (job?.skipped || 0);
  const total = job?.total || 0;
  const progress = total ? (processed / total) * 100 : 0;
  const isDone = job?.status === "done";

  return (
    <Dialog open onOpenChange={isDone ? onClose : undefined}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDone ? (
              <><CheckCircle2 className="h-5 w-5 text-teal" /> Outreach Complete</>
            ) : (
              <><RefreshCw className="h-5 w-5 animate-spin text-teal" /> Sending Messages...</>
            )}
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
            <Progress value={progress} />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <MiniStat label="Sent"      value={job?.sent}      colorClass="text-teal" />
            <MiniStat label="Failed"    value={job?.failed}    colorClass="text-rose" />
            <MiniStat label="Skipped"   value={job?.skipped}   colorClass="text-amber" />
            <MiniStat label="Left"      value={job?.remaining} colorClass="text-ink-muted" />
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

        <DialogFooter>
          {isDone ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
              Live · {formatNumber(processed)} / {formatNumber(total)}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
