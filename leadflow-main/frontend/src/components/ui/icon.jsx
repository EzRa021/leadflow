import { cn } from "@/lib/utils";

// Material Symbols Outlined icon — the icon system used by the Stitch designs.
// Usage: <Icon name="dashboard" /> or <Icon name="star" fill className="text-amber" />
// Size is controlled via font-size utilities (e.g. text-sm, text-base, text-xl).
export function Icon({ name, className, fill = false, ...props }) {
  return (
    <span
      className={cn("material-symbols-outlined select-none leading-none", fill && "fill-icon", className)}
      aria-hidden="true"
      {...props}
    >
      {name}
    </span>
  );
}
