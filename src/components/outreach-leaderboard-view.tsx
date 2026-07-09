"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import { num, pct } from "@/lib/format";
import { CHANNEL_LABELS, type Funnel, type OutreachChannel } from "@/lib/outreach";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { FunnelBar } from "@/components/funnel-bar";
import { EmptyState } from "@/components/empty-state";
import { NewScriptDialog } from "@/components/forms/new-script-dialog";
import { StaggerPage } from "@/components/dashboard/stagger-page";
import { FadeInSection } from "@/components/dashboard/fade-in-section";
import { CardShell } from "@/components/dashboard/card-shell";
import { GlowBlob, GlowUnderline } from "@/components/dashboard/glow";
import { HeroNumber } from "@/components/dashboard/hero-number";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SORTS = {
  reply: { label: "Reply rate", key: "replyRate" as const },
  booked: { label: "Call-booked rate", key: "callBookedRate" as const },
  close: { label: "Close rate", key: "closeRate" as const },
};
type SortKey = keyof typeof SORTS;

type ScriptRow = {
  script: {
    id: string;
    name: string;
    channel: OutreachChannel;
    status: "testing" | "winning" | "retired";
  };
  funnel: Funnel;
};

export function OutreachLeaderboardView({ rows }: { rows: ScriptRow[] }) {
  const [activeSort, setActiveSort] = useState<SortKey>("reply");

  const sortedRows = useMemo(() => {
    const key = SORTS[activeSort].key;
    return [...rows].sort((a, b) => b.funnel[key] - a.funnel[key]);
  }, [rows, activeSort]);

  const top = sortedRows[0];

  return (
    <StaggerPage>
      {top && (
        <CardShell className="overflow-hidden px-8 py-10 sm:px-10 sm:py-11">
          <div className="relative">
            <GlowBlob accent="cream" />
            <p className="kpi-label relative z-10">
              Top script · {SORTS[activeSort].label}
            </p>
            <div className="relative z-10 mt-4">
              <HeroNumber
                value={top.funnel[SORTS[activeSort].key]}
                format="pct"
                size="mega"
                accent="cream"
              />
            </div>
            <GlowUnderline accent="cream" className="relative z-10 mt-4 h-[3px] w-40" />
            <p className="relative z-10 mt-5 text-sm text-muted-foreground">
              <Link
                href={`/outreach/${top.script.id}`}
                className="font-medium text-[var(--text-primary)] hover:underline"
              >
                {top.script.name}
              </Link>
              {" · "}
              {CHANNEL_LABELS[top.script.channel]} · {num(top.funnel.contacted)} contacted
            </p>
          </div>
        </CardShell>
      )}

      <FadeInSection className="flex items-center gap-1 text-sm">
        <span className="mr-2 text-muted-foreground">Rank by</span>
        {(Object.keys(SORTS) as SortKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveSort(key)}
            className={cn(
              "relative rounded-md px-3 py-1.5 transition-colors",
              activeSort === key
                ? "font-medium text-[var(--accent-primary)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {activeSort === key && (
              <motion.div
                layoutId="sort-pill"
                className="absolute inset-0 rounded-md bg-[var(--bg-surface)]"
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
            <span className="relative z-10">{SORTS[key].label}</span>
          </button>
        ))}
      </FadeInSection>

      {sortedRows.length === 0 ? (
        <CardShell className="overflow-hidden p-0">
          <EmptyState
            icon={Send}
            title="No scripts yet"
            description="Log your first cold-outreach hook or script to start tracking reply, booked, and close rates."
            action={<NewScriptDialog />}
          />
        </CardShell>
      ) : (
        <CardShell key={activeSort} className="overflow-hidden p-0">
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
              {sortedRows.map(({ script, funnel }, i) => (
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
        </CardShell>
      )}
    </StaggerPage>
  );
}
