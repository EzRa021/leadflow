import { Smartphone, Info, FileSpreadsheet } from "lucide-react";
import ConnectionPanel from "@/components/ConnectionPanel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-in">
      <ConnectionPanel />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-ink-muted" />
            <CardTitle>About LeadFlow</CardTitle>
          </div>
          <CardDescription>Outreach platform for Ezra Dev Studio</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-ink-muted leading-relaxed">
            LeadFlow helps you import leads from CSV, manage outreach templates, and send personalized
            WhatsApp messages at scale — without ever accidentally re-messaging a lead that's already
            been contacted.
          </p>
          <Separator />
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-muted">Version</dt>
              <dd className="mt-1 font-medium text-ink">2.0</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-muted">API URL</dt>
              <dd className="mt-1 font-mono text-xs text-ink truncate">
                {import.meta.env.VITE_API_URL || "http://localhost:4000"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-ink-muted" />
            <CardTitle>CSV Format</CardTitle>
          </div>
          <CardDescription>Expected columns from a Google Maps export</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <code className="block rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs text-ink-muted leading-relaxed break-words">
            title, phone, email, company, categoryName, city, state, street, website, url, totalScore,
            reviewsCount
          </code>
          <p className="text-xs text-ink-muted leading-relaxed">
            Phone numbers are normalized to Nigerian format (234XXXXXXXXXX). Rows without a valid phone
            number are skipped during import.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-ink-muted" />
            <CardTitle>WhatsApp Auto-Connect</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-ink-muted leading-relaxed">
            LeadFlow automatically attempts to connect to WhatsApp every time the app is opened. If
            you're ever disconnected, scan the QR code above to reconnect — no need to restart anything.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
