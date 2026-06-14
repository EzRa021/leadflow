import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatNumber } from "@/lib/format";

export default function ResendConfirmModal({ info, onConfirm, onCancel, isSending }) {
  if (!info) return null;

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber" />
            {info.alreadySent} of {info.total} Already Contacted
          </DialogTitle>
          <DialogDescription>
            These leads have been messaged before. Sending again will re-contact them.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4">
          <div className="max-h-48 overflow-y-auto rounded-lg border border-line divide-y divide-line">
            {info.alreadySentLeads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">{lead.name}</p>
                  <p className="font-mono text-xs text-ink-muted">{lead.phone}</p>
                </div>
                <div className="text-right text-xs text-ink-muted shrink-0">
                  <p className="text-amber font-medium">Sent {lead.sendCount}×</p>
                  {lead.lastSentAt && <p>{new Date(lead.lastSentAt).toLocaleDateString()}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="warning" onClick={onConfirm} disabled={isSending}>
            {isSending ? "Sending..." : "Resend Anyway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
