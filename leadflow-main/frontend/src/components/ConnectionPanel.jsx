import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/icon";
import { useWhatsAppStatus } from "@/lib/useWhatsAppStatus";
import { cn } from "@/lib/utils";

const STATE_CONFIG = {
  ready:        { label: "Connected",  color: "text-teal-accent",   dot: "bg-teal-accent", icon: "wifi" },
  qr:           { label: "Scan QR",    color: "text-amber-warning", dot: "bg-amber-warning", icon: "qr_code_2" },
  connecting:   { label: "Connecting", color: "text-amber-warning", dot: "bg-amber-warning", icon: "sync" },
  disconnected: { label: "Offline",    color: "text-muted-text",    dot: "bg-rose", icon: "wifi_off" },
};

export default function ConnectionPanel() {
  const queryClient = useQueryClient();
  const { data: status } = useWhatsAppStatus();

  const connect = useMutation({
    mutationFn: api.connectWhatsApp,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] }),
  });
  const logout = useMutation({
    mutationFn: api.logoutWhatsApp,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] }),
  });

  const state = status?.status || "disconnected";
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.disconnected;

  return (
    <div className="bg-surface border border-outline-variant">
      <div className="p-5 border-b border-outline-variant flex items-start justify-between gap-3">
        <div>
          <h3 className="font-headline-md text-headline-md text-on-surface">WhatsApp Connection</h3>
          <p className="text-body-sm text-muted-text mt-0.5">
            {state === "ready" && status?.info?.pushname
              ? `Connected as ${status.info.pushname}`
              : state === "qr" ? "Open WhatsApp → Linked Devices → Scan QR"
              : state === "connecting" ? "Finishing connection, please wait..."
              : "Connect to start sending messages"}
          </p>
        </div>
        <span className={cn("flex items-center gap-1.5 px-2.5 py-1 text-label-md font-label-md border border-outline-variant shrink-0", cfg.color)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot, (state === "ready" || state === "connecting" || state === "qr") && "animate-pulse")} />
          {cfg.label}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {state === "disconnected" && (
          <button
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="w-full flex items-center justify-center gap-2 bg-teal-accent text-white py-2.5 font-semibold hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {connect.isPending ? <><Icon name="sync" className="animate-spin text-lg" /> Connecting...</> : <><Icon name="wifi" className="text-lg" /> Connect WhatsApp</>}
          </button>
        )}

        {state === "qr" && status?.qrDataUrl && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-3">
              <img src={status.qrDataUrl} alt="WhatsApp QR code" className="h-48 w-48 block" />
            </div>
            <p className="text-center text-body-sm text-muted-text max-w-xs">
              Open WhatsApp → Settings → Linked devices → Link a device → Scan this code
            </p>
          </div>
        )}

        {state === "connecting" && (
          <div className="flex items-center justify-center gap-2 py-4 text-body-sm text-muted-text">
            <Icon name="sync" className="animate-spin text-primary text-lg" /> Finishing setup...
          </div>
        )}

        {state === "ready" && (
          <div className="space-y-3">
            <div className="border border-teal-accent/20 bg-teal-accent/5 px-4 py-3">
              <p className="text-body-sm font-medium text-teal-accent">WhatsApp is ready</p>
              <p className="text-[11px] text-muted-text mt-0.5">Messages can be sent from the Pending Leads page</p>
            </div>
            <button
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="w-full flex items-center justify-center gap-2 border border-rose/30 text-rose hover:bg-rose/10 py-2.5 transition-colors disabled:opacity-50"
            >
              {logout.isPending ? <><Icon name="sync" className="animate-spin text-lg" /> Disconnecting...</> : <><Icon name="logout" className="text-lg" /> Disconnect</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
