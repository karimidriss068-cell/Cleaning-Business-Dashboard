"use client";

import { motion } from "framer-motion";
import { staggerContainer, fadeUpItem } from "./motion-variants";
import { DominantStat } from "./dominant-stat";
import { SupportingStat } from "./supporting-stat";
import { ChartPanel } from "./chart-panel";
import { TrendAreaChart } from "@/components/charts/trend-area-chart";

type Ctx = {
  activeCampaigns: number;
  spend: number;
  leads: number;
  appts: number;
};

export function DashboardView({
  stats,
  combinedCpa,
  internalCpa,
  clientCpa,
  cpaSparkline,
  spendTrend,
  cpaTrend,
  hasTrendData,
}: {
  stats: Record<"internal" | "client", Ctx>;
  combinedCpa: number | null;
  internalCpa: number | null;
  clientCpa: number | null;
  cpaSparkline: { date: string; value: number }[];
  spendTrend: { date: string; spend: number }[];
  cpaTrend: { period: string; cpa: number | null }[];
  hasTrendData: boolean;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-10 p-6 sm:space-y-14 sm:p-10"
    >
      <motion.p
        variants={fadeUpItem}
        className="font-heading text-3xl italic tracking-tight text-[var(--text-primary)]/90 sm:text-4xl"
      >
        This week, at a glance.
      </motion.p>

      <motion.div variants={fadeUpItem}>
        <DominantStat
          label="Cost per appointment"
          value={combinedCpa}
          sub="Blended spend ÷ appointments booked, this week"
          internal={internalCpa}
          client={clientCpa}
          sparklineData={cpaSparkline}
        />
      </motion.div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SupportingStat
          label="Active campaigns"
          internal={stats.internal.activeCampaigns}
          client={stats.client.activeCampaigns}
          format="num"
        />
        <SupportingStat
          label="Spend · this week"
          internal={stats.internal.spend}
          client={stats.client.spend}
          format="money"
        />
        <SupportingStat
          label="Leads · this week"
          internal={stats.internal.leads}
          client={stats.client.leads}
          format="num"
        />
        <SupportingStat
          label="Appts booked · this week"
          internal={stats.internal.appts}
          client={stats.client.appts}
          format="num"
        />
      </section>

      {hasTrendData && (
        <>
          <motion.div variants={fadeUpItem} className="divider-warm" />
          <section className="grid gap-6 lg:grid-cols-2">
            <ChartPanel title="Spend trend" sub="Daily spend, last 30 days">
              <TrendAreaChart
                data={spendTrend}
                xKey="date"
                yKey="spend"
                format="money"
                gradientId="spendGradient"
              />
            </ChartPanel>
            <ChartPanel title="CPA trend" sub="Weekly cost per appointment, last 8 weeks">
              <TrendAreaChart
                data={cpaTrend}
                xKey="period"
                yKey="cpa"
                format="money"
                gradientId="cpaGradient"
              />
            </ChartPanel>
          </section>
        </>
      )}
    </motion.div>
  );
}
