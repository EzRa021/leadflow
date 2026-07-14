// Zustand store for the reply-inbox feature (Tier 2 roadmap item).
// The `drafts` map is wired into InboxPage — it holds per-lead reply drafts
// so switching conversations never carries an unsent draft into the wrong
// thread (which a single shared useState would). activeLeadId/inboxFilter
// remain available for future inbox UI state.
//
// Why Zustand here specifically: "open conversation" + "draft reply" are
// UI-only state that multiple components (inbox list, conversation panel,
// reply composer) need to read/write without prop drilling, and none of it
// belongs in TanStack Query (which should keep owning the actual server
// data — messages, lead records, etc).

import { create } from "zustand";

export const useReplyInboxStore = create((set) => ({
  // id of the lead whose conversation is currently open in the inbox panel
  activeLeadId: null,
  setActiveLeadId: (leadId) => set({ activeLeadId: leadId }),

  // in-progress reply text, keyed by leadId so switching conversations
  // doesn't lose an unsent draft
  drafts: {},
  setDraft: (leadId, text) =>
    set((state) => ({
      drafts: { ...state.drafts, [leadId]: text },
    })),
  clearDraft: (leadId) =>
    set((state) => {
      const next = { ...state.drafts };
      delete next[leadId];
      return { drafts: next };
    }),

  // simple client-side filter for the inbox list (e.g. "unread only")
  inboxFilter: "all", // "all" | "unread" | "replied"
  setInboxFilter: (filter) => set({ inboxFilter: filter }),

  reset: () => set({ activeLeadId: null, drafts: {}, inboxFilter: "all" }),
}));
