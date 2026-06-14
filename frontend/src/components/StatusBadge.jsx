import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG = {
  pending:  { label: "Pending",  variant: "secondary" },
  sent:     { label: "Sent",     variant: "success" },
  failed:   { label: "Failed",   variant: "destructive" },
  skipped:  { label: "Skipped",  variant: "warning" },
  replied:  { label: "Replied",  variant: "info" },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <Badge variant={cfg.variant} className="gap-1.5 font-medium">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {cfg.label}
    </Badge>
  );
}
