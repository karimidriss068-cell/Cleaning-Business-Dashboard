import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { financeContext } from "@/lib/finance-auth";
import { loadCleaners, loadProject } from "@/lib/projects-data";
import { PageHeader } from "@/components/shell/page-header";
import { ProjectView } from "@/components/projects/project-view";

export const metadata: Metadata = { title: "Project" };
export const dynamic = "force-dynamic";

/** Owner and admin: one project's money, work days, costs and profit. */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await financeContext();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin) redirect("/leads");
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [project, cleaners] = await Promise.all([loadProject(ctx.supabase, id.data), loadCleaners(ctx.supabase)]);
  if (!project) notFound();
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-6 md:px-6">
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-3.5" aria-hidden /> Projects
      </Link>
      <PageHeader eyebrow={`Project ${project.number}`} title={project.title} description={`For ${project.accountName}.`} />
      <ProjectView project={project} cleaners={cleaners} />
    </div>
  );
}
