import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PitchTag from "./PitchTag";
import { formatNumber } from "@/lib/format";

const MATCH_VARIANT = { new: "success", existing: "warning", contacted: "destructive" };
const MATCH_LABEL   = { new: "New",     existing: "Existing",  contacted: "Contacted" };

export default function DuplicateImportModal({ preview, onClose, onConfirm, isConfirming }) {
  if (!preview) return null;
  const { counts } = preview;
  const hasDupes = counts.existing + counts.contacted > 0;
  const hasNew = counts.new > 0;
  // "all" means: insert new + reset existing/contacted to pending so they can be re-sent
  const totalActionable = counts.new + counts.existing + counts.contacted;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review Import</DialogTitle>
          <DialogDescription>
            {hasDupes
              ? `${formatNumber(counts.existing + counts.contacted)} duplicate(s) found — choose how to proceed.`
              : `${formatNumber(counts.total)} leads ready to import.`}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          {/* Summary grid */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "New",       value: counts.new,       cls: "text-teal" },
              { label: "Existing",  value: counts.existing,  cls: "text-amber" },
              { label: "Contacted", value: counts.contacted, cls: "text-rose" },
              { label: "Total",     value: counts.total,     cls: "text-ink" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-line bg-surface-2 px-3 py-3 text-center">
                <p className={`font-display text-2xl font-bold tabular ${s.cls}`}>{formatNumber(s.value)}</p>
                <p className="text-[11px] text-ink-muted mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {hasDupes && (
            <div className="space-y-2">
              <div className="flex gap-2 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2.5 text-xs text-ink-muted">
                <AlertCircle className="h-4 w-4 text-amber shrink-0 mt-0.5" />
                <span>
                  <strong className="text-ink">Existing</strong> = in DB, never messaged.{" "}
                  <strong className="text-ink">Contacted</strong> = already sent a message.{" "}
                  Choosing <em>"Import all"</em> will reset these leads to pending so they can be re-sent.
                </span>
              </div>
            </div>
          )}

          {/* Preview table */}
          <div className="max-h-52 overflow-auto rounded-lg border border-line">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Pitch</TableHead>
                  <TableHead>Match</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.slice(0, 10).map((row) => (
                  <TableRow key={row.phone}>
                    <TableCell className="font-medium text-ink">{row.name}</TableCell>
                    <TableCell className="font-mono text-xs text-ink-muted">{row.phone_raw || row.phone}</TableCell>
                    <TableCell><PitchTag pitchType={row.pitch_type} /></TableCell>
                    <TableCell>
                      <Badge variant={MATCH_VARIANT[row.matchType] || "secondary"}>
                        {MATCH_LABEL[row.matchType] || row.matchType}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {preview.rows.length > 10 && (
              <p className="border-t border-line px-4 py-2 text-center text-xs text-ink-muted">
                +{formatNumber(preview.rows.length - 10)} more rows
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isConfirming}>Cancel</Button>
          {hasDupes ? (
            <>
              {/* New only — disabled only when there are literally zero new leads */}
              <Button
                variant="outline"
                onClick={() => onConfirm("new_only")}
                disabled={isConfirming || !hasNew}
                title={!hasNew ? "No new leads to import" : undefined}
              >
                New only ({formatNumber(counts.new)})
              </Button>
              {/* Import all — always enabled when there's something actionable */}
              <Button
                onClick={() => onConfirm("all")}
                disabled={isConfirming || totalActionable === 0}
                variant="warning"
              >
                Import all &amp; reset duplicates ({formatNumber(totalActionable)})
              </Button>
            </>
          ) : (
            <Button onClick={() => onConfirm("new_only")} disabled={isConfirming}>
              {isConfirming ? "Importing..." : `Confirm ${formatNumber(counts.total)} leads`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
