import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Single source of truth for the WhatsApp connection-status poll. Previously
// three components (App's auto-connect, the Settings ConnectionPanel, and the
// header indicator in AppLayout) each declared this query with a DIFFERENT
// refetch interval (3000 / 2500 / 4000ms). They share the ["whatsapp-status"]
// key so TanStack Query already dedupes to one network request, but the
// drifted intervals were pure duplication waiting to diverge further.
// Centralizing here keeps one polling policy: fast while connecting, slow
// once ready.
const POLL_READY_MS = 15000;
const POLL_PENDING_MS = 3000;

export function useWhatsAppStatus() {
  return useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: api.getWhatsAppStatus,
    refetchInterval: (query) =>
      query.state.data?.status === "ready" ? POLL_READY_MS : POLL_PENDING_MS,
  });
}
