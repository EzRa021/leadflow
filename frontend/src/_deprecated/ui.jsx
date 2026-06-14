export function Card({ children, className = "", ...props }) {
  return (
    <div className={`rounded-card border border-line bg-surface ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="font-display text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-accent text-canvas hover:bg-accent/90",
  secondary: "border border-line text-ink hover:bg-surface-2",
  ghost: "text-muted hover:text-ink hover:bg-surface-2",
  danger: "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
  warn: "bg-warn text-canvas hover:bg-warn/90",
};

export function Button({ variant = "primary", className = "", disabled, children, ...props }) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({ children, color = "muted" }) {
  const colors = {
    muted: "bg-surface-2 text-muted border-line",
    accent: "bg-accent/10 text-accent border-accent/30",
    accent2: "bg-accent2/10 text-accent2 border-accent2/30",
    warn: "bg-warn/10 text-warn border-warn/30",
    danger: "bg-danger/10 text-danger border-danger/30",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

export function Input({ className = "", ...props }) {
  return (
    <input
      className={`w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted outline-none transition focus:border-accent ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }) {
  return (
    <textarea
      className={`w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted outline-none transition focus:border-accent ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", children, ...props }) {
  return (
    <select
      className={`rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Label({ children, className = "", ...props }) {
  return (
    <label className={`block text-xs font-medium text-muted ${className}`} {...props}>
      {children}
    </label>
  );
}

export function Checkbox({ className = "", ...props }) {
  return (
    <input
      type="checkbox"
      className={`h-4 w-4 rounded border-line bg-surface-2 accent-accent ${className}`}
      {...props}
    />
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />;
}

export function Progress({ value = 0, className = "" }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-surface-2 ${className}`}>
      <div
        className="h-full rounded-full bg-accent transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Dialog({ open, onClose, children, className = "" }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-canvas/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 w-full max-h-[90vh] overflow-y-auto rounded-t-card border border-line bg-surface shadow-xl sm:max-w-lg sm:rounded-card ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {onClose && (
        <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-ink">
          ×
        </button>
      )}
    </div>
  );
}

export function DialogFooter({ children, className = "" }) {
  return (
    <div className={`flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, hint, trend, icon: Icon, accent = "accent" }) {
  const accents = {
    accent: "text-accent",
    accent2: "text-accent2",
    warn: "text-warn",
    danger: "text-danger",
    muted: "text-muted",
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
          <p className={`mt-2 font-display text-2xl font-semibold tabular ${accents[accent] || accents.accent}`}>
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
          {trend != null && (
            <p className={`mt-1 text-xs ${trend >= 0 ? "text-accent" : "text-danger"}`}>
              {trend >= 0 ? "+" : ""}
              {trend} this week
            </p>
          )}
        </div>
        {Icon && (
          <div className={`rounded-lg border border-line bg-surface-2 p-2.5 ${accents[accent]}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </Card>
  );
}
