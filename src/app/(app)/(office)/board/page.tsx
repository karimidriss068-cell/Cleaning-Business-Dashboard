import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { financeContext } from "@/lib/finance-auth";
import { listBoardSessions } from "@/lib/board/data";
import { PageHeader } from "@/components/shell/page-header";
import { BoardForm } from "@/components/board/board-form";
import { SessionsList } from "@/components/board/sessions-list";

export const metadata: Metadata = { title: "Roast Room" };
export const dynamic = "force-dynamic";
// A review calls several models at once and then the synthesis; allow it time to finish.
export const maxDuration = 120;

/** Owner and admin only: a panel of AI advisors critiques a business decision. */
export default async function BoardPage() {
  const ctx = await financeContext();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin) redirect("/command-center");
  const sessions = await listBoardSessions(ctx.supabase);
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Business" title="Roast Room" description="Bring a decision. AI advisors critique it from different angles, then a chair gives a verdict and three actions for the next 7 days." />
      <BoardForm />
      <SessionsList sessions={sessions} />
    </div>
  );
}
