import { formatNyDateTime } from "@/lib/format";
import { messageOutcome, messageOutcomeLabel, messageOutcomeTone } from "@/lib/status";
import type { SyncStatus } from "@/lib/schemas/ghl";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { EmptyState } from "@/components/system/empty-state";
import { MessageSquare } from "lucide-react";

const TEMPLATE_LABELS: Record<string, string> = {
  instant_reply: "Instant reply", booking_confirmation: "Booking confirmation", reminder_24h: "24-hour reminder", review_request: "Review request", payment_link: "Payment link",
};

/** The last texts the system decided about: sent, dry-run, blocked (and why) or failed. */
export function MessageLog({ messages }: { messages: SyncStatus["recentMessages"] }) {
  return (
    <GlassPanel as="section" aria-labelledby="ghl-log" className="kc-enter p-5" data-testid="ghl-message-log">
      <h2 id="ghl-log" className="font-heading text-lg font-medium text-ink">Recent automated texts</h2>
      {messages.length === 0 ? (
        <EmptyState icon={MessageSquare} title="Nothing yet">Once a lead, visit or invoice is due a text, it shows here, even in dry-run.</EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {messages.map((m) => {
            const outcome = messageOutcome(m.outcome);
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                <span className="text-ink">{TEMPLATE_LABELS[m.template] ?? m.template}<span className="text-ink-muted"> · {formatNyDateTime(m.at)}</span></span>
                <span className="flex items-center gap-2">
                  {m.reason && <span className="text-ink-muted">{m.reason}</span>}
                  <StatusPill tone={messageOutcomeTone[outcome]}>{messageOutcomeLabel[outcome]}</StatusPill>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </GlassPanel>
  );
}
