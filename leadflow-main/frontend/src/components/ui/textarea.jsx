import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex min-h-[80px] w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink shadow-sm placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal focus-visible:border-teal disabled:cursor-not-allowed disabled:opacity-50 resize-y",
      className
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
