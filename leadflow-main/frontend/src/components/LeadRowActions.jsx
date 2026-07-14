import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

// Row overflow menu shared by the leads tables: View details / WhatsApp / Delete.
export default function LeadRowActions({ lead, onView, onDelete, align = "end" }) {
  const [open, setOpen] = useState(false);
  const phone = (lead?.phone || "").replace(/\D/g, "");

  const item = "flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-left transition-colors";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="p-1 text-muted-text hover:text-on-surface transition-colors"
          aria-label="Row actions"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="more_vert" className="text-lg" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-48 p-1" onClick={(e) => e.stopPropagation()}>
        {onView && (
          <button className={cn(item, "text-on-surface hover:bg-surface-container-high")} onClick={() => { setOpen(false); onView(lead); }}>
            <Icon name="visibility" className="text-base text-muted-text" /> View details
          </button>
        )}
        <a
          href={`https://wa.me/${phone}`}
          target="_blank"
          rel="noreferrer"
          className={cn(item, "text-on-surface hover:bg-surface-container-high")}
          onClick={() => setOpen(false)}
        >
          <Icon name="chat" className="text-base text-teal-accent" /> Open WhatsApp
        </a>
        {onDelete && (
          <button className={cn(item, "text-rose hover:bg-rose/10")} onClick={() => { setOpen(false); onDelete(lead); }}>
            <Icon name="delete" className="text-base" /> Delete lead
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
