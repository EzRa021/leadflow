const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const error = new Error(body?.error || `Request failed: ${res.status}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }

  return body;
}

export const api = {
  // Leads
  getLeads: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/leads${qs ? `?${qs}` : ""}`);
  },
  getStats: () => request("/api/leads/stats"),
  updateLead: (id, updates) =>
    request(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
  deleteLead: (id) => request(`/api/leads/${id}`, { method: "DELETE" }),
  exportLeadsUrl: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return `${API_URL}/api/leads/export${qs ? `?${qs}` : ""}`;
  },

  // Import — preview then confirm flow
  previewImport: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_URL}/api/leads/import/preview`, {
      method: "POST",
      body: formData,
    });
    const body = await res.json();
    if (!res.ok) {
      const error = new Error(body?.error || "Import preview failed");
      error.body = body;
      throw error;
    }
    return body;
  },
  confirmImport: (batchId, mode, leadKeys) =>
    request("/api/leads/import/confirm", {
      method: "POST",
      body: JSON.stringify({ batchId, mode, leadKeys }),
    }),

  // WhatsApp
  getWhatsAppStatus: () => request("/api/whatsapp/status"),
  connectWhatsApp: () => request("/api/whatsapp/connect", { method: "POST" }),
  logoutWhatsApp: () => request("/api/whatsapp/logout", { method: "POST" }),

  // Send
  // Options: { confirmResend, templateId, rangeFrom, rangeTo }
  // If leadIds is empty and rangeFrom+rangeTo are set, backend uses range-based send.
  checkSend: (leadIds) =>
    request("/api/send/check", { method: "POST", body: JSON.stringify({ leadIds }) }),
  sendMessages: (leadIds, { confirmResend = false, templateId = null, rangeFrom, rangeTo } = {}) =>
    request("/api/send", {
      method: "POST",
      body: JSON.stringify({
        leadIds,
        confirmResend,
        templateId,
        ...(rangeFrom != null ? { rangeFrom } : {}),
        ...(rangeTo   != null ? { rangeTo }   : {}),
      }),
    }),
  getSendJob: (jobId) => request(`/api/send/jobs/${jobId}`),

  // Templates
  getTemplates: (pitchType) =>
    request(`/api/templates${pitchType ? `?pitch_type=${pitchType}` : ""}`),
  createTemplate: (data) =>
    request("/api/templates", { method: "POST", body: JSON.stringify(data) }),
  updateTemplate: (id, data) =>
    request(`/api/templates/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTemplate: (id) => request(`/api/templates/${id}`, { method: "DELETE" }),
  duplicateTemplate: (id) => request(`/api/templates/${id}/duplicate`, { method: "POST" }),
  previewTemplate: (body, lead) =>
    request("/api/templates/preview", { method: "POST", body: JSON.stringify({ body, lead }) }),
};
