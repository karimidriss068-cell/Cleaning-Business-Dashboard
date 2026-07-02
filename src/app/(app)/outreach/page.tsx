import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pct, num } from "@/lib/format";
import {
  computeFunnel,
  CHANNEL_LABELS,
  type OutreachContactStatus,
} from "@/lib/outreach";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { FunnelBar } from "@/components/funnel-bar";
import { NewScriptDialog } from "@/components/forms/new-script-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const SORTS = {
  reply: "Reply rate",
  booked: "Call-booked rate",
  close: "Close rate",
} as const;

type SortKey = keyof typeof SORTS;

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const activeSort: SortKey =
    sort && sort in SORTS ? (sort as SortKey) : "reply";

  const supabase = await createClient();
  const [{ data: scripts }, { data: contacts }] = await Promise.all([
    supabase.from("outreach_scripts").select("*").order("created_at", { ascending: false }),
    supabase.from("outreach_contacts").select("script_id, status"),
  ]);

  const byScript = new Map<string, { status: OutreachContactStatus }[]>();
  for (const c of contacts ?? []) {
    if (!c.script_id) continue;
    const arr = byScript.get(c.script_id) ?? [];
    arr.push({ status: c.status });
    byScript.set(c.script_id, arr);
  }

  const rows = (scripts ?? []).map((script) => ({
    script,
    funnel: computeFunnel(byScript.get(script.id) ?? []),
  }));

  const sortVal = (r: (typeof rows)[number]) =>
    activeSort === "reply"
      ? r.funnel.replyRate
      : activeSort === "booked"
        ? r.funnel.callBookedRate
        : r.funnel.closeRate;
  rows.sort((a, b) => sortVal(b) - sortVal(a));

  return (
    <>
      <PageHeader
        title="Script Leaderboard"
        description="Which cold-outreach hooks actually convert — and where they leak."
      >
        <NewScriptDialog />
      </PageHeader>

      <div className="space-y-4 p-6">
        {/* Sort lens toggle */}
        <div className="flex items-center gap-1 text-sm">
          <span className="mr-2 text-muted-foreground">Rank by</span>
          {(Object.keys(SORTS) as SortKey[]).map((key) => (
            <Link
              key={key}
              href={`/outreach?sort=${key}`}
              className={cn(
                "rounded-md px-3 py-1.5 transition-colors",
                activeSort === key
                  ? "bg-[var(--bg-surface)] font-medium text-[var(--accent-primary)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {SORTS[key]}
            </Link>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Script</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Contacted</TableHead>
                <TableHead className="text-right">Reply</TableHead>
                <TableHead className="text-right">Booked</TableHead>
                <TableHead className="text-right">Held</TableHead>
                <TableHead className="text-right">Close</TableHead>
                <TableHead>Funnel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No scripts yet — log your first hook to start tracking.
                  </TableCell>
                </TableRow>
              )}
              {rows.map(({ script, funnel }, i) => (
                <TableRow key={script.id}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/outreach/${script.id}`}
                      className="hover:text-primary hover:underline"
                    >
                      {script.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {CHANNEL_LABELS[script.channel]}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={script.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {num(funnel.contacted)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      activeSort === "reply" && "font-medium text-primary",
                    )}
                  >
                    {pct(funnel.replyRate)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      activeSort === "booked" && "font-medium text-primary",
                    )}
                  >
                    {pct(funnel.callBookedRate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(funnel.callHeldRate)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      activeSort === "close" && "font-medium text-primary",
                    )}
                  >
                    {pct(funnel.closeRate)}
                  </TableCell>
                  <TableCell>
                    <FunnelBar funnel={funnel} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
