import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "./components/layout/AppLayout";
import { Toaster } from "./components/ui/toaster";
import { api } from "./lib/api";
import { useWhatsAppStatus } from "./lib/useWhatsAppStatus";

import DashboardPage from "./pages/DashboardPage";
import ImportPage from "./pages/ImportPage";
import PendingLeadsPage from "./pages/PendingLeadsPage";
import SentLeadsPage from "./pages/SentLeadsPage";
import TemplatesPage from "./pages/TemplatesPage";
import SettingsPage from "./pages/SettingsPage";
import AllLeadsPage from "./pages/AllLeadsPage";
import InboxPage from "./pages/InboxPage";

// Auto-connect WhatsApp on every launch, with retry until connected.
// The backend also calls initWhatsApp() on startup, so by the time the
// frontend loads, WhatsApp is usually already authenticating or ready.
// This component reflects that state in real time by polling status.
function WhatsAppAutoConnect() {
  const queryClient = useQueryClient();
  const retryRef = useRef(null);

  const { data: statusData } = useWhatsAppStatus();

  const connectMutation = useMutation({
    mutationFn: api.connectWhatsApp,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] }),
    onError: () => {},
  });

  useEffect(() => {
    const status = statusData?.status;
    // Only auto-connect if the backend reports disconnected AND the user
    // didn't manually log out. Without the manualDisconnect check, clicking
    // Disconnect would immediately be undone by this auto-connect.
    if (status === "disconnected" && !statusData?.manualDisconnect) {
      clearTimeout(retryRef.current);
      retryRef.current = setTimeout(() => {
        connectMutation.mutate();
      }, 800);
    }
    return () => clearTimeout(retryRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusData?.status, statusData?.manualDisconnect]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <WhatsAppAutoConnect />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/leads" element={<AllLeadsPage />} />
          <Route path="/pending" element={<PendingLeadsPage />} />
          <Route path="/sent" element={<SentLeadsPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
