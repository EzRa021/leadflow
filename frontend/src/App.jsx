import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "./components/layout/AppLayout";
import { Toaster } from "./components/ui/toaster";
import { api } from "./lib/api";

import DashboardPage from "./pages/DashboardPage";
import ImportPage from "./pages/ImportPage";
import PendingLeadsPage from "./pages/PendingLeadsPage";
import SentLeadsPage from "./pages/SentLeadsPage";
import TemplatesPage from "./pages/TemplatesPage";
import SettingsPage from "./pages/SettingsPage";
import AllLeadsPage from "./pages/AllLeadsPage";

// Auto-connect WhatsApp on every launch, with retry until connected.
// The backend also calls initWhatsApp() on startup, so by the time the
// frontend loads, WhatsApp is usually already authenticating or ready.
// This component reflects that state in real time by polling status.
function WhatsAppAutoConnect() {
  const queryClient = useQueryClient();
  const retryRef = useRef(null);

  const { data: statusData } = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: api.getWhatsAppStatus,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "ready" ? 15000 : 3000;
    },
  });

  const connectMutation = useMutation({
    mutationFn: api.connectWhatsApp,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] }),
    onError: () => {},
  });

  useEffect(() => {
    const status = statusData?.status;
    // Only trigger connect if the backend reports disconnected.
    // If backend already started WhatsApp (qr/connecting/ready), do nothing.
    if (status === "disconnected") {
      clearTimeout(retryRef.current);
      retryRef.current = setTimeout(() => {
        connectMutation.mutate();
      }, 800);
    }
    return () => clearTimeout(retryRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusData?.status]);

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
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
