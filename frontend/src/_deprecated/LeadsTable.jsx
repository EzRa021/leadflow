import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import StatusBadge from "./StatusBadge";
import PitchTag from "./PitchTag";
import ResendConfirmModal from "./ResendConfirmModal";

const PAGE_SIZE = 25;

export default function LeadsTable() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [pitchFilter, setPitchFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [resendInfo, setResendInfo] = useState(null);
  const [toast, setToast] = useState(null);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["leads", { page, statusFilter, pitchFilter, search }],
    queryFn: () =>
      api.getLeads({
        page,
        pageSize: PAGE_SIZE,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(pitchFilter ? { pitch_type: pitchFilter } : {}),
        ...(search ? { search } : {}),
      }),
    keepPreviousData: true,
  });

  const leads = data?.data || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const refreshAfterSend = () => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const sendMutation = useMutation({
    mutationFn: ({ ids, confirmResend }) => api.sendMessages(ids, confirmResend),
    onSuccess: (res) => {
      setToast(`Sending to ${res.total} lead(s)... statuses will update shortly.`);
      setSelected(new Set());
      setResendInfo(null);
      setTimeout(refreshAfterSend, 4000);
      setTimeout(() => setToast(null), 5000);
    },
    onError: (err) => {
      if (err.status === 409) {
        setResendInfo({ ...err.body, leadIds: Array.from(selected) });
      } else {
        setToast(err.body?.error || err.message);
        setTimeout(() => setToast(null), 5000);
      }
    },
  });

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  };

  const handleSendSelected = () => {
    if (!selected.size) return;
    sendMutation.mutate({ ids: Array.from(selected), confirmResend: false });
  };

  const handleConfirmResend = () => {
    sendMutation.mutate({ ids: resendInfo.leadIds, confirmResend: true });
  };

  return (
    <div className="rounded-card border border-line bg-surface">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search name, phone, category..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-56 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink placeholder:text-muted outline-none focus:border-accent"
          />

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="skipped">Skipped</option>
            <option value="replied">Replied</option>
          </select>

          <select
            value={pitchFilter}
            onChange={(e) => {
              setPitchFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="">All pitches</option>
            <option value="POS">POS</option>
            <option value="WEBSITE">Website</option>
            <option value="GENERIC">General</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <span className="text-xs text-muted">{selected.size} selected</span>
          )}
          <button
            onClick={handleSendSelected}
            disabled={!selected.size || sendMutation.isPending}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-canvas transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sendMutation.isPending ? "Sending..." : "Send to selected"}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="border-b border-line bg-surface-2 px-4 py-2 text-sm text-ink">{toast}</div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={leads.length > 0 && selected.size === leads.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-line bg-surface-2 accent-accent"
                />
              </th>
              <th className="px-4 py-3 font-medium">Business</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Pitch</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last sent</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
                  Loading leads...
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
                  No leads yet. Upload a CSV to get started.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead.id}
                  className={`border-b border-line transition hover:bg-surface-2 ${
                    selected.has(lead.id) ? "bg-accent/5" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleSelect(lead.id)}
                      className="h-4 w-4 rounded border-line bg-surface-2 accent-accent"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{lead.name}</p>
                    {lead.city && <p className="text-xs text-muted">{lead.city}</p>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{lead.phone}</td>
                  <td className="px-4 py-3 text-muted">{lead.category || "—"}</td>
                  <td className="px-4 py-3">
                    <PitchTag pitchType={lead.pitch_type} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                    {lead.send_count > 1 && (
                      <span className="ml-2 text-xs text-muted">×{lead.send_count}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {lead.last_sent_at ? new Date(lead.last_sent_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
        <span>
          {totalCount === 0
            ? "0 leads"
            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalCount)} of ${totalCount}`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded border border-line px-2.5 py-1 transition hover:text-ink disabled:opacity-30"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded border border-line px-2.5 py-1 transition hover:text-ink disabled:opacity-30"
          >
            Next
          </button>
        </div>
      </div>

      <ResendConfirmModal
        info={resendInfo}
        onConfirm={handleConfirmResend}
        onCancel={() => setResendInfo(null)}
        isSending={sendMutation.isPending}
      />
    </div>
  );
}
