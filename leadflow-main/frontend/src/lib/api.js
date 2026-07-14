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
  getAnalytics: () => request("/api/leads/analytics"),
  updateLead: (id, updates) =>
    request(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
  deleteLead: (id) => request(`/api/leads/${id}`, { method: "DELETE" }),
  bulkDeleteLeads: (ids) =>
    request("/api/leads/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) }),
  bulkUpdateLeads: (ids, updates) =>
    request("/api/leads/bulk", { method: "PATCH", body: JSON.stringify({ ids, updates }) }),
  exportLeadsUrl: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return `${API_URL}/api/leads/export${qs ? `?${qs}` : ""}`;
  },
  getCategories: () => request("/api/leads/categories"),
  getLeadEvents: (id) => request(`/api/leads/${id}/events`),

  // Rejected-rows CSV download (Tier 2 #8) — direct link, not a fetch,
  // so the browser handles the file download/Content-Disposition itself.
  rejectedCsvUrl: (batchId) => `${API_URL}/api/leads/import/${batchId}/rejected.csv`,

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
  // Column mapping (Tier 3 #11) — sniff headers, then re-run preview with a mapping
  getCsvHeaders: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_URL}/api/leads/import/headers`, { method: "POST", body: formData });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error || "Could not read CSV headers");
    return body;
  },
  previewImportWithMapping: async (file, mapping) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mapping", JSON.stringify(mapping));
    const res = await fetch(`${API_URL}/api/leads/import/preview`, { method: "POST", body: formData });
    const body = await res.json();
    if (!res.ok) {
      const error = new Error(body?.error || "Import preview failed");
      error.body = body;
      throw error;
    }
    return body;
  },

  // WhatsApp
  getWhatsAppStatus: () => request("/api/whatsapp/status"),
  connectWhatsApp: () => request("/api/whatsapp/connect", { method: "POST" }),
  logoutWhatsApp: () => request("/api/whatsapp/logout", { method: "POST" }),

  // Send
  // Options: { confirmResend, templateId, rangeFrom, rangeTo, search, pitch_type, category, has_website, sortBy, sortDir }
  // If leadIds is empty and rangeFrom+rangeTo are set, backend uses range-based send with active filters.
  checkSend: (leadIds) =>
    request("/api/send/check", { method: "POST", body: JSON.stringify({ leadIds }) }),
  sendMessages: (leadIds, options = {}) => {
    const { confirmResend = false, templateId = null, ...rest } = options;
    return request("/api/send", {
      method: "POST",
      body: JSON.stringify({
        leadIds,
        confirmResend,
        templateId,
        ...rest,
      }),
    });
  },
  getSendConfig: () => request("/api/send/config"),
  getSendJob: (jobId) => request(`/api/send/jobs/${jobId}`),
  stopSendJob: (jobId) => request(`/api/send/jobs/${jobId}/stop`, { method: "POST" }),
  getActiveSendJob: () => request("/api/send/jobs/active"),

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

  // Saved views (Tier 3 #10) — one-click filter presets
  getViews: () => request("/api/views"),
  createView: (name, filters, isPinned = false) =>
    request("/api/views", { method: "POST", body: JSON.stringify({ name, filters, isPinned }) }),
  updateView: (id, updates) =>
    request(`/api/views/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
  deleteView: (id) => request(`/api/views/${id}`, { method: "DELETE" }),

  // Inbox (Tier 2 #6) — WhatsApp reply threads
  getInbox: () => request("/api/inbox"),
  getInboxThread: (leadId) => request(`/api/inbox/${leadId}`),
  markInboxRead: (leadId) => request(`/api/inbox/${leadId}/read`, { method: "POST" }),
  sendInboxReply: (leadId, body) =>
    request(`/api/inbox/${leadId}/reply`, { method: "POST", body: JSON.stringify({ body }) }),
};
