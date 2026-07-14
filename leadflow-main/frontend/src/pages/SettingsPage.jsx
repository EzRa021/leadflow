import ConnectionPanel from "@/components/ConnectionPanel";
import { Icon } from "@/components/ui/icon";

function InfoCard({ icon, title, description, children }) {
  return (
    <div className="bg-surface border border-outline-variant">
      <div className="p-5 border-b border-outline-variant">
        <div className="flex items-center gap-2">
          <Icon name={icon} className="text-lg text-primary" />
          <h3 className="font-headline-md text-headline-md text-on-surface">{title}</h3>
        </div>
        {description && <p className="text-body-sm text-muted-text mt-0.5">{description}</p>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface">Settings</h2>
        <p className="text-muted-text text-body-sm mt-1">WhatsApp connection & application preferences.</p>
      </div>

      <ConnectionPanel />

      <InfoCard icon="info" title="About LeadFlow" description="Outreach platform for Ezra Dev Studio">
        <p className="text-body-sm text-muted-text leading-relaxed">
          LeadFlow helps you import leads from CSV, manage outreach templates, and send personalized
          WhatsApp messages at scale — without ever accidentally re-messaging a lead that's already
          been contacted.
        </p>
        <div className="grid grid-cols-2 gap-4 border-t border-outline-variant pt-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-text">Version</p>
            <p className="mt-1 font-medium text-on-surface">2.1</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-text">API URL</p>
            <p className="mt-1 font-mono text-[11px] text-on-surface truncate">
              {import.meta.env.VITE_API_URL || "http://localhost:4000"}
            </p>
          </div>
        </div>
      </InfoCard>

      <InfoCard icon="table_chart" title="CSV Format" description="Expected columns from a Google Maps export">
        <code className="block border border-outline-variant bg-surface-container-lowest p-3 font-mono text-[11px] text-muted-text leading-relaxed break-words">
          title, phone, email, company, categoryName, city, state, street, website, url, totalScore, reviewsCount
        </code>
        <p className="text-[11px] text-muted-text leading-relaxed">
          Phone numbers are normalized to Nigerian format (234XXXXXXXXXX). Rows without a valid phone
          number are skipped during import.
        </p>
      </InfoCard>

      <InfoCard icon="smartphone" title="WhatsApp Auto-Connect">
        <p className="text-[11px] text-muted-text leading-relaxed">
          LeadFlow automatically attempts to connect to WhatsApp every time the app is opened. If you're
          ever disconnected, scan the QR code above to reconnect — no need to restart anything.
        </p>
      </InfoCard>
    </div>
  );
}
