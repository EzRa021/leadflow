import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import StatusBadge from "@/components/StatusBadge";
import PitchTag from "@/components/PitchTag";
import RatingStars from "@/components/RatingStars";
import { cn } from "@/lib/utils";

const EVENT_ICON = {
  imported: "upload_file",
  sent: "send",
  failed: "cancel",
  skipped: "skip_next",
  status_changed: "edit",
  replied: "reply",
  note: "sticky_note_2",
};

function ActivityTimeline({ leadId }) {
  const { data, isLoading } = useQuery({
    queryKey: ["lead-events", leadId],
    queryFn: () => api.getLeadEvents(leadId),
    enabled: !!leadId,
  });
  const events = data?.events || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-label-md font-label-md text-muted-text uppercase tracking-wider">
        <Icon name="history" className="text-base" /> Activity timeline
      </div>
      {isLoading ? (
        <div className="space-y-1.5">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : events.length === 0 ? (
        <p className="text-body-sm text-muted-text">No recorded activity yet.</p>
      ) : (
        <div className="border border-outline-variant divide-y divide-outline-variant">
          {events.map((e) => (
            <div key={e.id} className="flex items-start gap-2.5 px-3 py-2.5">
              <Icon name={EVENT_ICON[e.event_type] || "schedule"} className="text-base mt-0.5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-body-sm text-on-surface capitalize">{e.event_type.replace(/_/g, " ")}</p>
                {e.detail && <p className="text-[11px] text-muted-text break-words">{e.detail}</p>}
                <p className="text-[10px] text-muted-text mt-0.5">{formatDate(e.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon name={icon} className="text-base text-muted-text mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-text">{label}</p>
        <div className="text-body-sm text-on-surface break-words">{children}</div>
      </div>
    </div>
  );
}

// Reusable lead detail drawer. Pass the already-loaded `lead` object plus an
// `onDelete(lead)` handler; the drawer fetches the activity timeline itself.
export default function LeadDetailsSheet({ lead, open, onOpenChange, onDelete }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-surface border-outline-variant overflow-hidden">
        {lead && (
          <>
            {/* Header */}
            <div className="p-5 border-b border-outline-variant">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-lg bg-primary-container/20 border border-primary/20 flex items-center justify-center shrink-0">
                  <span className="font-bold text-primary">{(lead.name || "?").slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="min-w-0 pr-6">
                  <h2 className="font-headline-md text-headline-md text-on-surface truncate">{lead.name}</h2>
                  {lead.company && lead.company !== lead.name && (
                    <p className="text-body-sm text-muted-text truncate">{lead.company}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <StatusBadge status={lead.status} />
                <PitchTag pitchType={lead.pitch_type} />
                {lead.send_count > 0 && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-text border border-outline-variant px-1.5 py-0.5">
                    Sent {lead.send_count}×
                  </span>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Contact */}
              <div className="grid grid-cols-1 gap-3">
                <Field icon="call" label="Phone"><span className="font-mono">{lead.phone_raw || lead.phone}</span></Field>
                {lead.email && <Field icon="mail" label="Email">{lead.email}</Field>}
                {lead.website && (
                  <Field icon="language" label="Website">
                    <a href={lead.website} target="_blank" rel="noreferrer" className="text-teal-accent hover:underline break-all">{lead.website}</a>
                  </Field>
                )}
                {(lead.street || lead.city || lead.state) && (
                  <Field icon="location_on" label="Address">
                    {[lead.street, lead.city, lead.state].filter(Boolean).join(", ")}
                  </Field>
                )}
                {lead.category && <Field icon="sell" label="Category">{lead.category}</Field>}
                {lead.total_score != null && (
                  <Field icon="star" label="Rating">
                    <div className="flex items-center gap-2">
                      <RatingStars score={lead.total_score} reviews={lead.reviews_count} />
                      <span className="text-muted-text">{lead.total_score} · {formatNumber(lead.reviews_count ?? 0)} reviews</span>
                    </div>
                  </Field>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3 border-t border-outline-variant pt-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-text">Imported</p>
                  <p className="text-body-sm text-on-surface">{formatDate(lead.created_at)}</p>
                </div>
                {lead.last_sent_at && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-text">Last sent</p>
                    <p className="text-body-sm text-on-surface">{formatDate(lead.last_sent_at)}</p>
                  </div>
                )}
              </div>

              {lead.last_message && (
                <div className="border border-outline-variant bg-surface-container p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-text mb-1">Last message</p>
                  <p className="text-body-sm text-on-surface whitespace-pre-wrap break-words">{lead.last_message}</p>
                </div>
              )}

              {lead.last_error && (
                <div className="border border-rose/30 bg-rose/5 px-3 py-2">
                  <p className="text-body-sm text-rose"><span className="font-semibold">Last error:</span> {lead.last_error}</p>
                </div>
              )}

              {/* Quick links */}
              <div className="flex flex-wrap gap-2">
                <a
                  href={`https://wa.me/${(lead.phone || "").replace(/\D/g, "")}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-label-md text-teal-accent border border-teal-accent/30 bg-teal-accent/10 px-3 py-1.5 hover:brightness-110 transition-all"
                >
                  <Icon name="chat" className="text-base" /> WhatsApp
                </a>
                {lead.maps_url && (
                  <a
                    href={lead.maps_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-label-md text-muted-text border border-outline-variant px-3 py-1.5 hover:border-primary hover:text-on-surface transition-colors"
                  >
                    <Icon name="map" className="text-base" /> Google Maps
                  </a>
                )}
              </div>

              <div className="border-t border-outline-variant pt-4">
                <ActivityTimeline leadId={lead.id} />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-outline-variant flex justify-between gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              {onDelete && (
                <Button variant="destructive" onClick={() => onDelete(lead)}>
                  <Icon name="delete" className="text-base" /> Delete Lead
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
