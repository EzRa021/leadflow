import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import PitchTag from "@/components/PitchTag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 25;

export default function SentLeadsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("sent");
  const [pitchFilter, setPitchFilter] = useState("all");
  const [sortKey, setSortKey] = useState("last_sent_at-desc");

  const [sortBy, sortDir] = sortKey.split("-");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["leads", "sent", { page, search, statusFilter, pitchFilter, sortBy, sortDir }],
    queryFn: () => api.getLeads({
      status: statusFilter,
      page,
      pageSize: PAGE_SIZE,
      sortBy,
      sortDir,
      ...(search ? { search } : {}),
      ...(pitchFilter !== "all" ? { pitch_type: pitchFilter } : {}),
    }),
  });

  const leads = data?.data || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const columns = useMemo(() => [
    {
      accessorKey: "name",
      header: "Business",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-ink">{row.original.name}</p>
          {row.original.city && <p className="text-xs text-ink-muted mt-0.5">{row.original.city}</p>}
        </div>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-ink-muted">{row.original.phone_raw || row.original.phone}</span>
      ),
    },
    {
      accessorKey: "pitch_type",
      header: "Pitch",
      cell: ({ row }) => <PitchTag pitchType={row.original.pitch_type} />,
    },
    {
      accessorKey: "status",
      header: "Delivery",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={row.original.status} />
          {row.original.send_count > 1 && (
            <span className="text-xs text-ink-muted">×{row.original.send_count}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "last_sent_at",
      header: "Date Sent",
      cell: ({ row }) => (
        <span className="text-xs text-ink-muted tabular">{formatDateTime(row.original.last_sent_at)}</span>
      ),
    },
    {
      id: "message",
      header: "Message",
      cell: ({ row }) => (
        <span className="line-clamp-2 max-w-[200px] text-xs text-ink-muted">
          {row.original.last_message
            ? row.original.last_message.slice(0, 90) + (row.original.last_message.length > 90 ? "…" : "")
            : "—"}
        </span>
      ),
    },
    {
      accessorKey: "last_error",
      header: "Notes",
      cell: ({ row }) => (
        <span className="text-xs text-rose">{row.original.last_error || "—"}</span>
      ),
    },
  ], []);

  const table = useReactTable({
    data: leads,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const exportUrl = api.exportLeadsUrl({
    status: statusFilter,
    ...(search ? { search } : {}),
    ...(pitchFilter !== "all" ? { pitch_type: pitchFilter } : {}),
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <Card>
        <CardHeader className="pb-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-ink-muted" />
              <CardTitle>Sent Leads</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search name, phone..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-8 w-full sm:w-48 text-xs"
              />
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                  <SelectItem value="replied">Replied</SelectItem>
                </SelectContent>
              </Select>
              <Select value={pitchFilter} onValueChange={(v) => { setPitchFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="All pitches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All pitches</SelectItem>
                  <SelectItem value="POS">POS</SelectItem>
                  <SelectItem value="WEBSITE">Website</SelectItem>
                  <SelectItem value="GENERIC">General</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortKey} onValueChange={setSortKey}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_sent_at-desc">Recently sent</SelectItem>
                  <SelectItem value="last_sent_at-asc">Oldest sent</SelectItem>
                  <SelectItem value="name-asc">Name A–Z</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" asChild>
                <a href={exportUrl} download>
                  <Download className="h-3.5 w-3.5" />
                  Export
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 mt-3">
          {isLoading ? (
            <div className="space-y-2 p-5">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : isError ? (
            <div className="py-16 text-center text-sm text-ink-muted">Could not load sent leads</div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="font-semibold text-ink">No sent leads yet</p>
              <p className="text-sm text-ink-muted mt-1">Leads appear here after your first outreach batch</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => (
                      <TableHead key={header.id}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {leads.length > 0 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <p className="text-xs text-ink-muted">
                {formatNumber((page - 1) * PAGE_SIZE + 1)}–{formatNumber(Math.min(page * PAGE_SIZE, totalCount))} of {formatNumber(totalCount)}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
