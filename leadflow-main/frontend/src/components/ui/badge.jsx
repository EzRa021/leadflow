import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-teal focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-teal text-canvas",
        secondary: "border-transparent bg-surface-2 text-ink-muted",
        destructive: "border-rose/30 bg-rose/10 text-rose",
        outline: "border-line text-ink",
        success: "border-teal/30 bg-teal/10 text-teal",
        warning: "border-amber/30 bg-amber/10 text-amber",
        info: "border-indigo/30 bg-indigo/10 text-indigo",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
