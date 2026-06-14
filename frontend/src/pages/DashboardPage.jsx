import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Users, Clock, Send, TrendingUp, AlertCircle, Activity, ArrowRight, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const CHART_COLORS = ["#5ee6c5", "#7c9bff", "#f5a623", "#f0556b", "#8b93a7"];

const CUSTOM_TOOLTIP_STYLE = {
  contentStyle: {
    background: "#13161f",
    border: "1px solid #262b3a",
    borderRadius: "10px",
    fontSize: 12,
    color: "#e7e9ee",
  },
};

function StatCard({ label, value, hint, accent, icon: Icon, trend }) {
  const accentMap = {
    teal:   "text-teal bg-teal/10 border-teal/20",
    indigo: "text-indigo bg-indigo/10 border-indigo/20",
    amber:  "text-amber bg-amber/10 border-amber/20",
    rose:   "text-rose bg-rose/10 border-rose/20",
    muted:  "text-ink-muted bg-surface-2 border-line",
  };
  const valueColors = {
    teal: "text-teal", indigo: "text-indigo", amber: "text-amber",
    rose: "text-rose", muted: "text-ink",
  };

  return (
    <Card className="group hover:border-line/80 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">{label}</p>
            <p className={`mt-2 font-display text-3xl font-bold tabular ${valueColors[accent] || "text-ink"}`}>
              {value}
            </p>
            {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
            {trend != null && (
              <p className={`mt-1 text-xs font-medium ${trend >= 0 ? "text-teal" : "text-rose"}`}>
                {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)} this week
              </p>
            )}
          </div>
          {Icon && (
            <div className={`rounded-lg border p-2.5 shrink-0 ${accentMap[accent] || accentMap.muted}`}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickAction({ to, title, desc, icon: Icon }) {
  return (
    <Link to={to}>
      <Card className="group hover:border-teal/30 hover:bg-surface-2/50 transition-all cursor-pointer h-full">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink group-hover:text-teal transition-colors">{title}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{desc}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-muted group-hover:text-teal group-hover:translate-x-0.5 transition-all shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function formatChartDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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

  if (isLoading) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <Card className="p-12 text-center">
        <AlertCircle className="h-10 w-10 text-rose mx-auto mb-3" />
        <p className="font-semibold text-ink">Could not load dashboard</p>
        <p className="text-sm text-ink-muted mt-1">Make sure the backend is running and try again</p>
      </Card>
    );
  }

  const pending = stats.byStatus.pending || 0;
  const sent    = stats.byStatus.sent    || 0;
  const failed  = stats.byStatus.failed  || 0;
  const skipped = stats.byStatus.skipped || 0;

  const pieData = [
    { name: "Sent",    value: sent,    color: "#5ee6c5" },
    { name: "Failed",  value: failed,  color: "#f0556b" },
    { name: "Skipped", value: skipped, color: "#f5a623" },
  ].filter((d) => d.value > 0);

  const pitchData = Object.entries(stats.byPitchType || {}).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Primary KPIs */}
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Leads"   value={formatNumber(stats.total)}         accent="teal"   icon={Users}       hint="All time" />
        <StatCard label="Pending"        value={formatNumber(pending)}             accent="amber"  icon={Clock}       hint="Ready to contact" />
        <StatCard label="Sent"           value={formatNumber(sent)}               accent="teal"   icon={Send}        hint="Successfully delivered" />
        <StatCard
          label="Success Rate"
          value={`${stats.successRate.rate}%`}
          accent="indigo"
          icon={TrendingUp}
          hint={`${formatNumber(sent)} of ${formatNumber(stats.successRate.total)}`}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <StatCard label="Failed"         value={formatNumber(failed)}             accent="rose"   icon={AlertCircle} />
        <StatCard label="Ever Contacted" value={formatNumber(stats.everContacted)} accent="muted"  icon={Activity} />
        <StatCard
          label="Today"
          value={formatNumber(stats.today.newLeads + stats.today.sent)}
          accent="teal"
          hint={`${stats.today.newLeads} new · ${stats.today.sent} sent`}
        />
        <StatCard
          label="This Week"
          value={formatNumber(stats.thisWeek.newLeads + stats.thisWeek.sent)}
          accent="indigo"
          hint={`${stats.thisWeek.newLeads} new · ${stats.thisWeek.sent} sent`}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Lead Growth</CardTitle>
            <CardDescription>New leads imported — last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.leadGrowth}>
                  <defs>
                    <linearGradient id="lgGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5ee6c5" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#5ee6c5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#262b3a" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatChartDate} stroke="#8b93a7" fontSize={11} axisLine={false} tickLine={false} />
                  <YAxis stroke="#8b93a7" fontSize={11} allowDecimals={false} axisLine={false} tickLine={false} width={30} />
                  <Tooltip {...CUSTOM_TOOLTIP_STYLE} labelFormatter={formatChartDate} />
                  <Area type="monotone" dataKey="count" stroke="#5ee6c5" fill="url(#lgGrad)" strokeWidth={2} dot={false} name="Leads" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Sending Activity</CardTitle>
            <CardDescription>Messages sent — last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.sendingActivity}>
                  <CartesianGrid stroke="#262b3a" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatChartDate} stroke="#8b93a7" fontSize={11} axisLine={false} tickLine={false} />
                  <YAxis stroke="#8b93a7" fontSize={11} allowDecimals={false} axisLine={false} tickLine={false} width={30} />
                  <Tooltip {...CUSTOM_TOOLTIP_STYLE} labelFormatter={formatChartDate} />
                  <Bar dataKey="count" fill="#7c9bff" radius={[4, 4, 0, 0]} name="Sent" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Pitch breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>By Pitch Type</CardTitle>
            <CardDescription>Lead category breakdown</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-52">
              {pitchData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-ink-muted">Import leads to see breakdown</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pitchData} layout="vertical">
                    <CartesianGrid stroke="#262b3a" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" stroke="#8b93a7" fontSize={11} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" stroke="#8b93a7" fontSize={11} width={56} axisLine={false} tickLine={false} />
                    <Tooltip {...CUSTOM_TOOLTIP_STYLE} />
                    <Bar dataKey="value" fill="#5ee6c5" radius={[0, 4, 4, 0]} name="Leads" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Delivery donut */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle>Delivery</CardTitle>
            <CardDescription>Status mix</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-52">
              {pieData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-ink-muted">No sends yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={44} outerRadius={70} paddingAngle={3}>
                      {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip {...CUSTOM_TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex flex-col gap-1.5 mt-2">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-xs text-ink-muted">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
                  <span>{d.name}</span>
                  <span className="ml-auto font-mono-num text-ink">{formatNumber(d.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription className="mt-0.5">Latest leads added</CardDescription>
              </div>
              <Link to="/pending">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-3 pb-0 px-0">
            <div className="divide-y divide-line">
              {(recentLeads?.data || []).length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-ink-muted">
                  <p>No leads yet.</p>
                  <Link to="/import">
                    <Button variant="outline" size="sm" className="mt-2">Import CSV</Button>
                  </Link>
                </div>
              ) : (
                (recentLeads?.data || []).map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{lead.name}</p>
                      <p className="text-xs text-ink-muted mt-0.5">{lead.category || "No category"} · {formatDate(lead.created_at)}</p>
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted mb-3">Quick Actions</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickAction to="/import"    title="Import Leads"     desc="Upload and review CSV"          icon={Zap} />
          <QuickAction to="/pending"   title="Send Outreach"    desc={`${formatNumber(pending)} leads pending`} icon={Send} />
          <QuickAction to="/templates" title="Edit Templates"   desc="Customize your messages"        icon={Zap} />
        </div>
      </div>
    </div>
  );
}
