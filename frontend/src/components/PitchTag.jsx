import { cn } from "@/lib/utils";

const PITCH_CONFIG = {
  POS:     { label: "POS",     className: "text-teal border-teal/30 bg-teal/5" },
  WEBSITE: { label: "Website", className: "text-indigo border-indigo/30 bg-indigo/5" },
  GENERIC: { label: "General", className: "text-ink-muted border-line bg-surface-2" },
  CUSTOM:  { label: "Custom",  className: "text-amber border-amber/30 bg-amber/5" },
};

export default function PitchTag({ pitchType }) {
  const cfg = PITCH_CONFIG[pitchType] || PITCH_CONFIG.GENERIC;
  return (
    <span className={cn("inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider font-semibold", cfg.className)}>
      {cfg.label}
    </span>
  );
}
