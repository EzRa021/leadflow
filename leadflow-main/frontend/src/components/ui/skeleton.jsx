import * as React from "react";
import { cn } from "@/lib/utils";

const Skeleton = ({ className, ...props }) => (
  <div className={cn("animate-pulse rounded-lg bg-surface-2", className)} {...props} />
);

export { Skeleton };
