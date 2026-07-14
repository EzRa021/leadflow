import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkPlus, Pin, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

// One-click saved filter presets (Tier 3 roadmap item #10).
//
// `activeFilters` should be the same shape passed into api.getLeads —
// only the keys the backend actually persists (see FILTER_KEYS in
// backend/src/routes/views.js) are saved; anything else is ignored.
// `onApply(filters)` is called with the saved filter object when the
// user picks a view — the caller is responsible for mapping those
// fields back onto its own local filter state.
export default function SavedViewsBar({ activeFilters, onApply }) {
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["views"],
    queryFn: api.getViews,
  });
  const views = data?.views || [];

  const saveMutation = useMutation({
    mutationFn: () => api.createView(newName, activeFilters),
    onSuccess: () => {
      toast({ title: "View saved", description: `"${newName}" is now available as a one-click filter.` });
      setNewName("");
      setSaveOpen(false);
      queryClient.invalidateQueries({ queryKey: ["views"] });
    },
    onError: (err) => toast({ title: "Couldn't save view", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.deleteView(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["views"] }),
  });

  const hasActiveFilters = activeFilters && Object.keys(activeFilters).length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {views.map((view) => (
        <div key={view.id} className="group relative">
          <Badge
            variant="secondary"
            className="cursor-pointer gap-1 pr-1 hover:bg-secondary/80"
            onClick={() => onApply(view.filters)}
          >
            {view.is_pinned && <Pin className="h-3 w-3" />}
            {view.name}
            <button
              type="button"
              className="ml-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/10 p-0.5"
              onClick={(e) => {
                e.stopPropagation();
                deleteMutation.mutate(view.id);
              }}
              aria-label={`Delete saved view ${view.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      ))}

      {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}

      <Popover open={saveOpen} onOpenChange={setSaveOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={!hasActiveFilters}
            title={hasActiveFilters ? "Save current filters as a view" : "Apply at least one filter first"}
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            Save view
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Bookmark className="h-3.5 w-3.5" /> Save current filters
            </p>
            <Input
              placeholder="e.g. No website + Restaurants"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) saveMutation.mutate();
              }}
              autoFocus
            />
            <Button
              size="sm"
              className="w-full"
              disabled={!newName.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
