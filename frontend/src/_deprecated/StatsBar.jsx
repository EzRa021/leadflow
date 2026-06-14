import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function StatsBar() {
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: api.getStats,
  });

  const cards = [
    { label: "Total leads", value: stats?.total ?? "—", accent: "text-ink" },
    { label: "Pending", value: stats?.byStatus?.pending ?? 0, accent: "text-muted" },
    { label: "Sent", value: stats?.byStatus?.sent ?? 0, accent: "text-accent" },
    { label: "Failed / skipped", value: (stats?.byStatus?.failed ?? 0) + (stats?.byStatus?.skipped ?? 0), accent: "text-warn" },
    { label: "Replied", value: stats?.byStatus?.replied ?? 0, accent: "text-accent2" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-card border border-line bg-surface p-4">
          <p className={`font-display text-2xl font-semibold tabular ${card.accent}`}>{card.value}</p>
          <p className="mt-1 text-xs text-muted">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
