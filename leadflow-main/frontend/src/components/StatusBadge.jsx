import { cn } from "@/lib/utils";

// Stitch status treatment: colored dot + uppercase label, no pill.
const STATUS_CONFIG = {
  pending: { label: "Pending", color: "text-amber-warning", dot: "bg-amber-warning" },
  sent:    { label: "Sent",    color: "text-teal-accent",   dot: "bg-teal-accent" },
  failed:  { label: "Failed",  color: "text-rose",          dot: "bg-rose" },
  skipped: { label: "Skipped", color: "text-muted-text",    dot: "bg-muted-text" },
  replied: { label: "Replied", color: "text-indigo-accent", dot: "bg-indigo-accent" },
  paused:  { label: "Paused",  color: "text-amber-warning", dot: "bg-amber-warning" },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide", cfg.color)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}
