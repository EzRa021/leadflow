import { Send, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatDuration, formatNumber } from "@/lib/format";

export default function SendConfirmModal({ open, onClose, onConfirm, leadCount, templateName, estimatedSeconds, isSending }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Outreach</DialogTitle>
          <DialogDescription>Review the details before sending messages via WhatsApp.</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-3">
          <div className="rounded-lg border border-line bg-surface-2 divide-y divide-line">
            <Row label="Recipients" value={
              <span className="font-display text-lg font-bold text-teal tabular">{formatNumber(leadCount)}</span>
            } />
            <Row label="Template" value={templateName || "Default per pitch type"} />
            <Row label="Est. duration" value={
              <span className="flex items-center gap-1.5 text-ink-muted">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(estimatedSeconds)}
              </span>
            } />
          </div>
          <p className="text-xs text-ink-muted rounded-lg border border-line bg-surface-2/50 px-3 py-2 leading-relaxed">
            Messages are sent one at a time with a delay between each to avoid rate limits. You can monitor live progress once sending starts.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSending}>Cancel</Button>
          <Button onClick={onConfirm} disabled={isSending}>
            {isSending ? (
              <>Sending...</>
            ) : (
              <><Send className="h-4 w-4" /> Send to {formatNumber(leadCount)} leads</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm font-medium text-ink">{value}</span>
    </div>
  );
}
