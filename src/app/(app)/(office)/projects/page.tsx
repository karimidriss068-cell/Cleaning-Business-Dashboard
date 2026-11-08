import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HardHat } from "lucide-react";
import { financeContext } from "@/lib/finance-auth";
import { loadProjects } from "@/lib/projects-data";
import { formatCents } from "@/lib/format";
import { projectLabel, projectTone } from "@/lib/status";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";

export const metadata: Metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

const money = (c: number) => formatCents(c, { hideZeroCents: true });

/** Owner and admin: every won project, what it's worth, what's been billed and collected, and its profit so far. */
export default async function ProjectsPage() {
  const ctx = await financeContext();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin) redirect("/leads");
  const projects = await loadProjects(ctx.supabase);
  const active = projects.filter((p) => p.status === "scheduled" || p.status === "in_progress");
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        eyebrow="Operate"
        title="Projects"
        description={`${active.length} active · ${money(active.reduce((t, p) => t + p.contractCents, 0))} under contract`}
      />
      {projects.length === 0 ? (
        <GlassPanel>
          <EmptyState icon={HardHat} title="No projects yet">When you win a bid, create the project from the bid and it shows up here.</EmptyState>
        </GlassPanel>
      ) : (
        <GlassPanel as="section" aria-label="Projects" className="overflow-x-auto" data-testid="projects-table">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[12px] text-ink-muted">
                <th scope="col" className="px-4 py-3 font-medium">Project</th>
                <th scope="col" className="px-2 py-3 font-medium">Status</th>
                <th scope="col" className="px-2 py-3 text-right font-medium">Contract</th>
                <th scope="col" className="px-2 py-3 text-right font-medium">Invoiced</th>
                <th scope="col" className="px-2 py-3 text-right font-medium">Collected</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Profit so far</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-t border-hairline">
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <Link href={`/projects/${p.id}`} className="font-medium text-ink underline-offset-2 hover:underline">{p.title}</Link>
                    <span className="block text-[13px] text-ink-muted">{p.accountName} · Project {p.number}</span>
                  </th>
                  <td className="px-2 py-3"><StatusPill tone={projectTone(p.status)}>{projectLabel[p.status]}</StatusPill></td>
                  <td className="px-2 py-3 text-right text-ink tabular">{money(p.contractCents)}</td>
                  <td className="px-2 py-3 text-right text-ink tabular">{money(p.money.invoicedCents)}</td>
                  <td className="px-2 py-3 text-right text-ink tabular">{money(p.money.collectedCents)}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink tabular">{money(p.money.actualProfitCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      )}
    </div>
  );
}
