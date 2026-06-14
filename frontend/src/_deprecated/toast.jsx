import { createContext, useCallback, useContext, useState } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((toast) => {
    const id = crypto.randomUUID();
    const entry = { id, type: "info", duration: 4000, ...toast };
    setToasts((prev) => [...prev, entry]);
    if (entry.duration) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, entry.duration);
    }
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${TOAST_STYLES[toast.type] || TOAST_STYLES.info}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                {toast.title && <p className="font-medium text-ink">{toast.title}</p>}
                {toast.message && <p className="mt-0.5 text-xs text-muted">{toast.message}</p>}
              </div>
              <button onClick={() => dismiss(toast.id)} className="text-muted hover:text-ink">
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TOAST_STYLES = {
  info: "border-line bg-surface",
  success: "border-accent/30 bg-surface",
  error: "border-danger/30 bg-surface",
  warn: "border-warn/30 bg-surface",
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
