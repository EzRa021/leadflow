import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

// Sortable table header with an aligned, state-aware sort indicator.
// Shared by the Pending and All Leads tables.
export default function SortableTh({ col, sortBy, sortDir, onSort, children, className }) {
  const active = sortBy === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={cn(
        "p-3 text-label-md font-label-md text-muted-text uppercase tracking-wider cursor-pointer hover:text-primary transition-colors group select-none",
        className,
      )}
    >
      <div className="flex items-center gap-1">
        {children}
        <Icon
          name={active ? (sortDir === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
          className={cn("text-xs transition-opacity", active ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-100")}
        />
      </div>
    </th>
  );
}
