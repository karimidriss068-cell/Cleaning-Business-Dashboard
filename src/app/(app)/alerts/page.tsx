import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { AcknowledgeButton } from "@/components/acknowledge-button";
import { EmptyState } from "@/components/empty-state";
import { StaggerPage } from "@/components/dashboard/stagger-page";
import { FadeInSection } from "@/components/dashboard/fade-in-section";
import { CardShell } from "@/components/dashboard/card-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const supabase = await createClient();

  const { data: alerts } = await supabase
    .from("alerts")
    .select("*, campaign:campaigns(id, name)")
    .order("triggered_at", { ascending: false });

  const list = alerts ?? [];
  const unacked = list.filter((a) => !a.acknowledged).length;

  return (
    <>
      <PageHeader
        title="Alerts"
        description={
          unacked > 0
            ? `${unacked} unacknowledged alert${unacked === 1 ? "" : "s"}.`
            : "Guardrail alert history — CPA thresholds and stalled campaigns."
        }
      />
      <StaggerPage>
        <FadeInSection>
        <CardShell className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Triggered</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState
                      icon={ShieldCheck}
                      title="All quiet"
                      description="No guardrail alerts yet — CPA thresholds and stalled-campaign warnings will show up here the moment they trigger."
                    />
                  </TableCell>
                </TableRow>
              )}
              {list.map((a) => (
                <TableRow
                  key={a.id}
                  className={cn(!a.acknowledged && "bg-[var(--bg-surface)]")}
                >
                  <TableCell>
                    <StatusBadge status={a.type} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "max-w-md whitespace-normal",
                      a.acknowledged
                        ? "text-muted-foreground"
                        : "text-foreground",
                    )}
                  >
                    {a.message}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.campaign ? (
                      <Link
                        href={`/campaigns/${a.campaign.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {a.campaign.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {shortDate(a.triggered_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {a.acknowledged ? (
                      <span className="text-xs text-[var(--success)]">
                        Acknowledged ✓
                      </span>
                    ) : (
                      <AcknowledgeButton alertId={a.id} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardShell>
        </FadeInSection>
      </StaggerPage>
    </>
  );
}
