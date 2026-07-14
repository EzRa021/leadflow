import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "@/lib/use-toast";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useReplyInboxStore } from "@/store/replyInboxStore";

const POLL_MS = 5000;

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function shortTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [filter, setFilter] = useState("all"); // all | unread

  const draft = useReplyInboxStore((s) => (selectedLeadId ? s.drafts[selectedLeadId] || "" : ""));
  const setDraftFor = useReplyInboxStore((s) => s.setDraft);
  const clearDraft = useReplyInboxStore((s) => s.clearDraft);

  const { data: inboxData, isLoading, isError } = useQuery({
    queryKey: ["inbox"],
    queryFn: api.getInbox,
    refetchInterval: POLL_MS,
  });

  const conversations = inboxData?.conversations || [];
  const filtered = filter === "unread" ? conversations.filter((c) => c.unreadCount > 0) : conversations;

  // Auto-select the most recent conversation — desktop only, so mobile opens
  // on the list rather than jumping straight into a thread.
  useEffect(() => {
    const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
    if (isDesktop && !selectedLeadId && conversations.length > 0) {
      setSelectedLeadId(conversations[0].leadId);
    }
  }, [conversations, selectedLeadId]);

  const { data: threadData, isLoading: threadLoading } = useQuery({
    queryKey: ["inbox-thread", selectedLeadId],
    queryFn: () => api.getInboxThread(selectedLeadId),
    enabled: !!selectedLeadId,
    refetchInterval: POLL_MS,
  });

  const lead = threadData?.lead;
  const messages = threadData?.messages || [];

  const activeConversation = useMemo(
    () => conversations.find((c) => c.leadId === selectedLeadId),
    [conversations, selectedLeadId],
  );

  const markReadMutation = useMutation({
    mutationFn: (leadId) => api.markInboxRead(leadId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
    onError: () => console.warn("[inbox] failed to mark conversation as read"),
  });

  useEffect(() => {
    if (selectedLeadId && activeConversation?.unreadCount > 0) {
      markReadMutation.mutate(selectedLeadId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadId, activeConversation?.unreadCount]);

  const replyMutation = useMutation({
    mutationFn: ({ leadId, body }) => api.sendInboxReply(leadId, body),
    onSuccess: () => {
      clearDraft(selectedLeadId);
      queryClient.invalidateQueries({ queryKey: ["inbox-thread", selectedLeadId] });
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Reply failed", description: err.body?.error || err.message });
    },
  });

  const handleSend = () => {
    if (!draft.trim() || !selectedLeadId) return;
    replyMutation.mutate({ leadId: selectedLeadId, body: draft.trim() });
  };

  if (isError) {
    return (
      <div className="bg-surface-container border border-outline-variant p-16 text-center">
        <Icon name="cloud_off" className="text-4xl text-rose mx-auto block w-fit" />
        <p className="font-semibold text-on-surface mt-3">Could not load the inbox</p>
        <p className="text-body-sm text-muted-text mt-1 mb-4">Check backend connection and try again</p>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["inbox"] })}>Retry</Button>
      </div>
    );
  }

  const totalUnread = conversations.reduce((n, c) => n + (c.unreadCount || 0), 0);

  return (
    <div className="flex h-[calc(100vh-8rem)] border border-outline-variant bg-surface overflow-hidden animate-fade-in">
      {/* ── Left pane: conversation list ── */}
      <section
        className={cn(
          "w-full md:w-80 lg:w-96 shrink-0 border-r border-outline-variant flex-col bg-surface-dim",
          selectedLeadId ? "hidden md:flex" : "flex",
        )}
      >
        <div className="p-4 border-b border-outline-variant bg-surface">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-headline-md text-headline-md text-on-surface">Active Leads</h2>
            <span className="bg-primary/20 text-primary px-2 py-0.5 text-[10px] font-mono tabular">
              {conversations.length} TOTAL
            </span>
          </div>
          <div className="flex gap-2">
            {[
              { key: "all", label: "All" },
              { key: "unread", label: `Unread${totalUnread ? ` (${totalUnread})` : ""}` },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={cn(
                  "px-3 py-1 text-label-md rounded-full transition-colors",
                  filter === t.key ? "bg-primary text-on-primary-container" : "bg-surface-container-high text-muted-text hover:text-on-surface",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <div className="border border-outline-variant bg-surface-container p-4 mb-3">
                <Icon name="forum" className="text-2xl text-muted-text" />
              </div>
              <p className="text-body-sm font-medium text-on-surface">{filter === "unread" ? "No unread replies" : "No replies yet"}</p>
              <p className="text-[11px] text-muted-text mt-1">Inbound WhatsApp replies from leads show up here</p>
            </div>
          ) : (
            filtered.map((c) => {
              const active = c.leadId === selectedLeadId;
              const unread = c.unreadCount > 0;
              return (
                <button
                  key={c.leadId}
                  onClick={() => setSelectedLeadId(c.leadId)}
                  className={cn(
                    "w-full text-left p-4 border-b border-outline-variant flex gap-3 transition-colors",
                    active ? "bg-surface-container-high border-l-2 border-l-primary" : "hover:bg-surface-container-low border-l-2 border-l-transparent",
                  )}
                >
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-lg bg-indigo-accent/10 border border-indigo-accent/30 flex items-center justify-center text-indigo-accent font-bold">
                      {initials(c.lead?.name)}
                    </div>
                    <div className={cn("absolute -bottom-1 -right-1 w-4 h-4 border-2 border-surface-dim rounded-full", unread ? "bg-teal-accent" : "bg-muted-text")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <span className={cn("font-headline-md text-headline-md truncate", active ? "text-primary" : "text-on-surface")}>
                        {c.lead?.name || "Unknown lead"}
                      </span>
                      <span className={cn("text-label-md shrink-0", unread ? "text-primary font-bold" : "text-muted-text")}>{shortTime(c.lastAt)}</span>
                    </div>
                    <p className={cn("text-body-sm truncate mt-0.5", unread ? "text-on-surface font-semibold" : "text-muted-text")}>
                      {c.lastDirection === "outbound" ? "You: " : ""}{c.lastMessage}
                    </p>
                    {unread && (
                      <div className="flex items-center justify-end mt-1.5">
                        <span className="bg-primary text-on-primary-container min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-bold">
                          {c.unreadCount}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* ── Right pane: message thread ── */}
      <section className={cn("flex-1 flex-col bg-background min-w-0", selectedLeadId ? "flex" : "hidden md:flex")}>
        {!selectedLeadId ? (
          <div className="flex-1 flex items-center justify-center text-body-sm text-muted-text">
            Select a conversation to view the thread
          </div>
        ) : (
          <>
            {/* Thread header */}
            <header className="h-16 border-b border-outline-variant bg-surface/50 backdrop-blur px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => setSelectedLeadId(null)} className="md:hidden text-on-surface-variant p-1">
                  <Icon name="arrow_back" className="text-xl" />
                </button>
                <div className="w-10 h-10 rounded-lg bg-primary-container/20 border border-primary/20 flex items-center justify-center shrink-0">
                  <span className="font-bold text-primary text-body-sm">{initials(lead?.name)}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-headline-md text-headline-md leading-tight truncate">{lead?.name || "…"}</h3>
                  <div className="flex items-center gap-1 text-muted-text">
                    {lead?.total_score != null && (
                      <>
                        <Icon name="star" fill className="text-[14px] text-amber-warning" />
                        <span className="text-label-md">{lead.total_score} •</span>
                      </>
                    )}
                    <span className="text-label-md font-mono">{lead?.phone_raw || lead?.phone}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {lead?.website && (
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="p-2 text-muted-text hover:text-primary transition-colors border border-outline-variant rounded-lg">
                    <Icon name="language" className="text-lg" />
                  </a>
                )}
              </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {threadLoading ? (
                <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-2/3" />)}</div>
              ) : messages.length === 0 ? (
                <p className="text-body-sm text-muted-text text-center py-10">No messages in this thread yet</p>
              ) : (
                messages.map((m) => {
                  const outbound = m.direction === "outbound";
                  return (
                    <div key={m.id} className={cn("flex gap-3 max-w-[85%] lg:max-w-[70%]", outbound ? "flex-row-reverse ml-auto" : "")}>
                      <div className={cn(
                        "shrink-0 w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold border",
                        outbound ? "bg-primary/20 border-primary/40 text-primary" : "bg-surface-container-highest border-outline-variant text-muted-text",
                      )}>
                        {outbound ? "ME" : "LEAD"}
                      </div>
                      <div className={cn(
                        "p-3 border",
                        outbound
                          ? "bg-primary-container/20 border-primary/30 rounded-tl-xl rounded-bl-xl rounded-br-xl"
                          : "bg-surface-container-high border-outline-variant rounded-tr-xl rounded-br-xl rounded-bl-xl",
                      )}>
                        <p className="text-body-md text-on-surface whitespace-pre-wrap break-words">{m.body}</p>
                        <div className={cn("flex items-center gap-1 mt-1", outbound ? "justify-end" : "")}>
                          <span className="text-[10px] text-muted-text">{shortTime(m.created_at)}</span>
                          {outbound && <Icon name="done_all" fill className="text-[14px] text-primary" />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Composer */}
            <footer className="p-4 border-t border-outline-variant bg-surface shrink-0">
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setDraftFor(selectedLeadId, (draft ? draft + " " : "") + "{{name}}")}
                    className="bg-surface-container-high hover:bg-surface-container-highest px-3 py-1.5 rounded-lg border border-outline-variant text-label-md text-muted-text flex items-center gap-1.5 transition-colors"
                  >
                    <Icon name="data_object" className="text-lg" /> Variables
                  </button>
                  <a
                    href="/templates"
                    className="bg-surface-container-high hover:bg-surface-container-highest px-3 py-1.5 rounded-lg border border-outline-variant text-label-md text-muted-text flex items-center gap-1.5 transition-colors"
                  >
                    <Icon name="text_snippet" className="text-lg" /> Templates
                  </a>
                </div>
                <div className="flex items-end gap-2 bg-surface-container-lowest border border-outline-variant rounded-xl p-2 focus-within:border-primary transition-colors">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraftFor(selectedLeadId, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                    rows={1}
                    placeholder={`Type a reply to ${lead?.name || "lead"}…  (Enter to send)`}
                    className="flex-1 bg-transparent border-none focus:outline-none text-body-md py-2 px-1 resize-none max-h-32 min-h-[40px]"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!draft.trim() || replyMutation.isPending}
                    className="w-10 h-10 bg-teal-accent text-white rounded-lg flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40 shrink-0"
                  >
                    {replyMutation.isPending
                      ? <Icon name="progress_activity" className="animate-spin text-lg" />
                      : <Icon name="send" fill className="text-lg" />}
                  </button>
                </div>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
