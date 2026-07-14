import { cn } from "@/lib/utils";

// Stitch category-badge style: tiny uppercase, tinted bg + border, bold.
const PITCH_CONFIG = {
  POS:     { label: "POS",     className: "text-teal-accent bg-teal-accent/10 border-teal-accent/20" },
  WEBSITE: { label: "Website", className: "text-indigo-accent bg-indigo-accent/10 border-indigo-accent/20" },
  GENERIC: { label: "General", className: "text-muted-text bg-surface-container-lowest border-outline-variant" },
  CUSTOM:  { label: "Custom",  className: "text-amber-warning bg-amber-warning/10 border-amber-warning/20" },
};

export default function PitchTag({ pitchType }) {
  const cfg = PITCH_CONFIG[pitchType] || PITCH_CONFIG.GENERIC;
  return (
    <span className={cn("inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border", cfg.className)}>
      {cfg.label}
    </span>
  );
}
