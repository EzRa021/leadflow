import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#16191E",
    border: "1px solid #1F2937",
    borderRadius: "4px",
    fontSize: 12,
    color: "#e2e2e8",
  },
  labelStyle: { color: "#94A3B8" },
};

function formatChartDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function KpiCard({ label, value, icon, trendIcon, trendText, trendColor = "text-teal-accent" }) {
  return (
    <div className="bg-surface border border-outline-variant p-4 relative overflow-hidden group transition-all hover:border-primary/50">
      <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-100 transition-opacity">
        <Icon name={icon} className="text-primary text-xl" />
      </div>
      <div className="text-muted-text font-label-md text-label-md mb-2">{label}</div>
      <div className="font-headline-lg text-headline-lg text-on-surface tabular">{value}</div>
      {trendText && (
        <div className={cn("text-[11px] mt-2 flex items-center gap-1", trendColor)}>
          <Icon name={trendIcon} className="text-sm" /> {trendText}
        </div>
      )}
    </div>
  );
}

// Recent-activity type chip color by lead status.
const ACTIVITY_TYPE = {
  replied: { label: "New Reply",  color: "text-teal-accent" },
  sent:    { label: "Sent",       color: "text-indigo-accent" },
  failed:  { label: "Bounce",     color: "text-rose-error" },
  skipped: { label: "Skipped",    color: "text-muted-text" },
  pending: { label: "New Lead",   color: "text-primary" },
};

export default function DashboardPage() {
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ["stats"],
    queryFn: api.getStats,
    refetchInterval: 30000,
  });

  const { data: recentLeads } = useQuery({
    queryKey: ["leads", "recent"],
    queryFn: () => api.getLeads({ pageSize: 6, sortBy: "created_at", sortDir: "desc" }),
  });

  const { data: analytics } = useQuery({
    queryKey: ["analytics"],
    queryFn: api.getAnalytics,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Skeleton className="h-80 lg:col-span-8" />
          <Skeleton className="h-80 lg:col-span-4" />
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="bg-surface-container border border-outline-variant p-12 text-center">
        <Icon name="cloud_off" className="text-4xl text-rose mx-auto block w-fit" />
        <p className="font-semibold text-on-surface mt-3">Could not load dashboard</p>
        <p className="text-body-sm text-muted-text mt-1">Make sure the backend is running and try again</p>
      </div>
    );
  }

  const pending = stats.byStatus.pending || 0;
  const sent    = stats.byStatus.sent    || 0;
  const failed  = stats.byStatus.failed  || 0;
  const skipped = stats.byStatus.skipped || 0;
  const replied = stats.byStatus.replied || 0;
  const replyRate = sent > 0 ? Math.round((replied / sent) * 100) : 0;

  // Merge the two 14-day timelines into one series for the volume chart.
  const growthByDate = Object.fromEntries((stats.leadGrowth || []).map((d) => [d.date, d.count]));
  const volumeData = (stats.sendingActivity || []).map((d) => ({
    date: d.date,
    sent: d.count,
    leads: growthByDate[d.date] || 0,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header actions */}
      <div className="hidden md:flex justify-between items-end">
        <div>
          <h2 className="font-headline-xl text-headline-xl text-on-surface">Dashboard</h2>
          <p className="text-muted-text font-body-md">Real-time outreach performance and lead tracking.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/import" className="bg-surface-container border border-outline-variant hover:border-primary px-4 py-2 flex items-center gap-2 transition-colors active:scale-[0.98] text-label-md font-label-md text-on-surface">
            <Icon name="upload_file" className="text-lg" /> Import Leads
          </Link>
          <Link to="/templates" className="bg-surface-container border border-outline-variant hover:border-primary px-4 py-2 flex items-center gap-2 transition-colors active:scale-[0.98] text-label-md font-label-md text-on-surface">
            <Icon name="layers" className="text-lg" /> New Template
          </Link>
        </div>
      </div>

      {/* KPI grid */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Leads" value={formatNumber(stats.total)} icon="groups"
          trendIcon="trending_up" trendText={`+${formatNumber(stats.thisWeek.newLeads)} this week`} />
        <KpiCard label="Messages Sent" value={formatNumber(sent)} icon="send"
          trendIcon="trending_up" trendText={`+${formatNumber(stats.thisWeek.sent)} this week`} />
        <KpiCard label="Reply Rate %" value={`${replyRate}%`} icon="reply"
          trendIcon={replyRate > 0 ? "trending_up" : "trending_flat"}
          trendText={`${formatNumber(replied)} replied`}
          trendColor={replyRate > 0 ? "text-teal-accent" : "text-amber-warning"} />
        <KpiCard label="Success Rate" value={`${stats.successRate.rate}%`} icon="verified"
          trendIcon="trending_up" trendText={`${formatNumber(sent)} of ${formatNumber(stats.successRate.total)}`} />
      </section>

      {/* Chart + activity split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 14-day volume */}
        <div className="lg:col-span-8 bg-surface border border-outline-variant p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-headline-md text-headline-md text-on-surface">14-Day Outreach Volume</h3>
            <div className="flex gap-3">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary" /><span className="text-[10px] text-muted-text uppercase font-bold tracking-wider">Sent</span></span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-secondary" /><span className="text-[10px] text-muted-text uppercase font-bold tracking-wider">New Leads</span></span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeData} barGap={2}>
                <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatChartDate} stroke="#94A3B8" fontSize={11} axisLine={false} tickLine={false} />
                <YAxis stroke="#94A3B8" fontSize={11} allowDecimals={false} axisLine={false} tickLine={false} width={30} />
                <Tooltip {...TOOLTIP_STYLE} labelFormatter={formatChartDate} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="sent" fill="#6bd8cb" radius={[2, 2, 0, 0]} name="Sent" />
                <Bar dataKey="leads" fill="#c3c0ff" radius={[2, 2, 0, 0]} name="New Leads" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent activity */}
        <div className="lg:col-span-4 bg-surface border border-outline-variant flex flex-col">
          <div className="p-4 border-b border-outline-variant flex justify-between items-center">
            <h3 className="font-headline-md text-headline-md text-on-surface">Recent Activity</h3>
            <Icon name="history" className="text-muted-text text-xl" />
          </div>
          <div className="flex-1 overflow-y-auto max-h-[360px]">
            {(recentLeads?.data || []).length === 0 ? (
              <div className="px-5 py-10 text-center text-body-sm text-muted-text">
                <p>No leads yet.</p>
                <Link to="/import"><Button variant="outline" size="sm" className="mt-3">Import CSV</Button></Link>
              </div>
            ) : (
              (recentLeads?.data || []).map((lead) => {
                const type = ACTIVITY_TYPE[lead.status] || ACTIVITY_TYPE.pending;
                return (
                  <div key={lead.id} className="p-3 border-b border-outline-variant/30 hover:bg-surface-container-high/50 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <span className={cn("text-[11px] font-bold uppercase tracking-widest", type.color)}>{type.label}</span>
                      <span className="text-[10px] text-muted-text">{formatDate(lead.created_at)}</span>
                    </div>
                    <p className="text-body-sm leading-tight text-on-surface truncate">{lead.name}</p>
                    <div className="text-[11px] text-muted-text mt-1 flex items-center gap-1">
                      <Icon name="sell" className="text-[12px]" /> {lead.category || "Uncategorized"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="p-3 bg-surface-container-low text-center border-t border-outline-variant">
            <Link to="/sent" className="text-[11px] text-primary hover:underline font-bold uppercase tracking-widest">View All Logs</Link>
          </div>
        </div>
      </div>

      {/* Bottom: reply-rate-by-category + delivery health */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Reply rate by category */}
        <div className="bg-surface border border-outline-variant p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-headline-md text-headline-md text-on-surface">Reply Rate by Category</h3>
            <span className="text-label-md text-primary bg-primary/10 px-2 py-0.5">Top niches</span>
          </div>
          {!analytics?.byCategory?.length ? (
            <div className="flex items-center justify-center h-24 text-body-sm text-muted-text">No contacted leads yet</div>
          ) : (
            <div className="space-y-3">
              {analytics.byCategory.slice(0, 5).map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-medium text-on-surface truncate">{row.key}</p>
                    <div className="mt-1.5 h-1.5 w-full bg-surface-container-highest overflow-hidden rounded-full">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${row.replyRate}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-body-sm font-bold tabular text-teal-accent">{row.replyRate}%</p>
                    <p className="text-[10px] text-muted-text">{row.replied}/{row.contacted}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delivery health bento */}
        <div className="bg-surface border border-outline-variant p-4 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <h3 className="font-headline-md text-headline-md text-on-surface">Delivery Health</h3>
          </div>
          <div className="bg-surface-container-high/30 p-4 border border-outline-variant/20 flex flex-col items-center justify-center text-center">
            <div className="text-teal-accent font-headline-lg text-headline-lg">{stats.successRate.rate}%</div>
            <div className="text-label-md text-muted-text">Success Rate</div>
          </div>
          <div className="bg-surface-container-high/30 p-4 border border-outline-variant/20 flex flex-col items-center justify-center text-center">
            <div className="text-indigo-accent font-headline-lg text-headline-lg">{replyRate}%</div>
            <div className="text-label-md text-muted-text">Reply Rate</div>
          </div>
          <div className="col-span-2 grid grid-cols-3 gap-2">
            <MiniStat label="Pending" value={pending} color="text-amber-warning" />
            <MiniStat label="Failed" value={failed} color="text-rose-error" />
            <MiniStat label="Skipped" value={skipped} color="text-muted-text" />
          </div>
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/50 p-2.5 text-center">
      <div className={cn("font-headline-md text-headline-md tabular", color)}>{formatNumber(value)}</div>
      <div className="text-[10px] text-muted-text uppercase tracking-wider">{label}</div>
    </div>
  );
}
