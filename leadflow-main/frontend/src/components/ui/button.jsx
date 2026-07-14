import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Stitch primary CTA: solid teal-accent, white label, brighten on hover.
        default: "bg-teal-accent text-white hover:brightness-110 active:scale-[0.98] font-semibold",
        destructive: "bg-rose/10 text-rose border border-rose/30 hover:bg-rose/20",
        outline: "border border-line bg-transparent text-ink hover:bg-surface-2 hover:text-ink",
        secondary: "bg-surface-2 text-ink border border-line hover:bg-surface hover:border-ink-muted",
        ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
        link: "text-teal underline-offset-4 hover:underline",
        warning: "bg-amber text-canvas hover:bg-amber/90 font-semibold",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
