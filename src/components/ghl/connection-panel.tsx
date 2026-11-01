import { formatNyDateTime } from "@/lib/format";
import type { GhlPageData } from "@/lib/ghl/status-data";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";

const WORKFLOWS = [
  { event: "contact", trigger: "Contact Created", body: '"event": "contact", "contactId": "{{contact.id}}"' },
  { event: "message", trigger: "Customer Replied", body: '"event": "message", "messageId": "{{message.id}}"' },
  { event: "opportunity", trigger: "Pipeline Stage Changed", body: '"event": "opportunity", "opportunityId": "{{opportunity.id}}"' },
  { event: "appointment", trigger: "Appointment Status", body: '"event": "appointment", "appointmentId": "{{appointment.id}}"' },
] as const;

function ago(iso: string | null): string {
  return iso ? formatNyDateTime(iso) : "Never";
}

/** Whether GHL is connected, what the sync has done lately, and what to set up on the GHL side. */
export function ConnectionPanel({ data, appUrl }: { data: GhlPageData; appUrl: string }) {
  const { env, status } = data;
  const checks = [
    { label: "API token", ok: env.token, hint: "GHL_API_TOKEN" },
    { label: "Location ID", ok: env.location, hint: "GHL_LOCATION_ID" },
    { label: "Webhook secret", ok: env.webhookSecret, hint: "GHL_WEBHOOK_SECRET, 32+ characters" },
    { label: "Cron secret", ok: env.cronSecret, hint: "CRON_SECRET" },
  ];
  const connected = env.token && env.location && env.webhookSecret;
  return (
    <GlassPanel as="section" aria-labelledby="ghl-conn" className="kc-enter space-y-5 p-5" data-testid="ghl-connection">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="ghl-conn" className="font-heading text-lg font-medium text-ink">GoHighLevel connection</h2>
          <p className="text-[13px] text-ink-muted">This business&apos;s own GHL sub-account. Keys live in the server environment, never in the database or the page.</p>
        </div>
        <StatusPill tone={connected ? "success" : "warning"}>{connected ? "Keys set" : "Keys missing"}</StatusPill>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center justify-between gap-3 rounded-sm border border-hairline px-3 py-2 text-[13px]">
            <span><span className="text-ink">{c.label}</span> <span className="text-ink-muted">({c.hint})</span></span>
            <StatusPill tone={c.ok ? "success" : "warning"}>{c.ok ? "Set" : "Missing"}</StatusPill>
          </li>
        ))}
      </ul>
      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-ink-muted">Last webhook</dt><dd className="text-ink tabular" data-testid="last-webhook">{ago(status.lastWebhookAt)}</dd></div>
        <div><dt className="text-ink-muted">Webhooks, last 24 hours</dt><dd className="text-ink tabular">{status.webhooks24h}</dd></div>
        <div><dt className="text-ink-muted">Last reconciliation</dt><dd className="text-ink tabular" data-testid="last-reconcile">{ago(status.lastReconcileAt)}</dd></div>
        <div><dt className="text-ink-muted">Queue</dt><dd className="text-ink tabular">{status.queue.pending} waiting · {status.queue.failed} failed · {status.queue.succeeded24h} done today</dd></div>
      </dl>
      {status.lastReconcileNote && <p className="text-[12px] text-ink-muted">Last reconciliation: {status.lastReconcileNote}</p>}

      <details className="rounded-sm border border-hairline p-3 text-[13px]">
        <summary className="cursor-pointer font-medium text-ink">GHL setup steps</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-muted">
          <li>Create a Private Integration token in the new sub-account (Settings, Private Integrations) with contacts, conversations, messages, opportunities and calendar access. Put it, the location id and a random secret in the server environment.</li>
          <li>Create a pipeline with the stages New, Contacted, Quote sent, Booked and Lost, then paste each stage&apos;s id into the mapping below.</li>
          <li>
            Make one workflow per row. Each ends with a Webhook action: method POST, URL <code className="break-all text-ink">{appUrl}/api/webhooks/ghl</code>,
            header <code className="text-ink">x-ghl-webhook-secret</code> with your secret, and a JSON body made of the row&apos;s fields plus <code className="text-ink">{'"eventId"'}</code> (unique per event) and <code className="text-ink">{'"sentAt"'}</code> (the time it fired).
          </li>
        </ol>
        <ul className="mt-3 space-y-1.5">
          {WORKFLOWS.map((w) => (
            <li key={w.event} className="text-ink-muted"><span className="text-ink">{w.trigger}</span>: <code className="break-all">{`{ ${w.body}, "eventId": …, "sentAt": … }`}</code></li>
          ))}
        </ul>
        <p className="mt-3 text-ink-muted">Customers who agree to texts get the tag <code className="text-ink">sms-consent</code> in GHL (or consent is recorded on the lead here). Nothing is texted without it.</p>
      </details>
    </GlassPanel>
  );
}
