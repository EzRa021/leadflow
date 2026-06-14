import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wifi, WifiOff, Smartphone, LogOut, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATE_CONFIG = {
  ready:        { label: "Connected",   badgeVariant: "success",   icon: Wifi },
  qr:           { label: "Scan QR",     badgeVariant: "warning",   icon: Smartphone },
  connecting:   { label: "Connecting",  badgeVariant: "warning",   icon: RefreshCw },
  disconnected: { label: "Offline",     badgeVariant: "secondary", icon: WifiOff },
};

export default function ConnectionPanel() {
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: api.getWhatsAppStatus,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "ready" ? 15000 : 2500;
    },
  });

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
  const StateIcon = cfg.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>WhatsApp Connection</CardTitle>
            <CardDescription className="mt-1">
              {state === "ready" && status?.info?.pushname
                ? `Connected as ${status.info.pushname}`
                : state === "qr"
                  ? "Open WhatsApp → Linked Devices → Scan QR"
                  : state === "connecting"
                    ? "Finishing connection, please wait..."
                    : "Connect to start sending messages"}
            </CardDescription>
          </div>
          <Badge variant={cfg.badgeVariant} className="shrink-0 gap-1.5">
            <StateIcon className="h-3 w-3" />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {state === "disconnected" && (
          <Button
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="w-full"
          >
            {connect.isPending ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Connecting...</>
            ) : (
              <><Wifi className="h-4 w-4" /> Connect WhatsApp</>
            )}
          </Button>
        )}

        {state === "qr" && status?.qrDataUrl && (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-xl bg-white p-3 shadow-lg">
              <img src={status.qrDataUrl} alt="WhatsApp QR code" className="h-48 w-48 block" />
            </div>
            <p className="text-center text-xs text-ink-muted max-w-xs">
              Open WhatsApp on your phone → Settings → Linked devices → Link a device → Scan this code
            </p>
          </div>
        )}

        {state === "connecting" && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-ink-muted">
            <RefreshCw className="h-4 w-4 animate-spin text-teal" />
            Finishing setup...
          </div>
        )}

        {state === "ready" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-teal/20 bg-teal/5 px-4 py-3">
              <p className="text-sm font-medium text-teal">WhatsApp is ready</p>
              <p className="text-xs text-ink-muted mt-0.5">Messages can be sent from the Pending leads page</p>
            </div>
            <Button
              variant="outline"
              className="w-full text-rose border-rose/30 hover:bg-rose/10 hover:border-rose/50"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              {logout.isPending ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Disconnecting...</>
              ) : (
                <><LogOut className="h-4 w-4" /> Disconnect</>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
