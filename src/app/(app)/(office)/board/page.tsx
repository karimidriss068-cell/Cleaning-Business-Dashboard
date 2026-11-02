import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { financeContext } from "@/lib/finance-auth";
import { listBoardSessions } from "@/lib/board/data";
import { PageHeader } from "@/components/shell/page-header";
import { BoardForm } from "@/components/board/board-form";
import { SessionsList } from "@/components/board/sessions-list";
import { AdvisorBench } from "@/components/board/advisor-bench";
import { Boardroom } from "@/components/board/scene/boardroom";
import { MOCK_SCENE } from "@/lib/board/scene/mock";
import { buildScript } from "@/lib/board/scene/script";
import { getBoardSession } from "@/lib/board/data";
import { sceneFromSession } from "@/lib/board/scene/from-session";
import Link from "next/link";

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
  // Show your latest real debate here; the sample only plays until you have run one.
  const latest = sessions[0] ? await getBoardSession(ctx.supabase, sessions[0].id) : null;
  const real = latest ? sceneFromSession(latest) : null;
  const scene = real ?? MOCK_SCENE;
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Business" title="Roast Room" description="Bring a decision. AI advisors critique it from different angles, then a chair gives a verdict and three actions for the next 7 days." />
      <section aria-label="Boardroom" data-testid="board-live-scene" className="space-y-2">
        <p className="text-[12px] uppercase tracking-wide text-ink-muted">
          {real && latest ? <>Live boardroom · your latest question · <Link href={`/board/${latest.id}`} className="text-brand-text underline-offset-2 hover:underline">open full session</Link></> : "Live boardroom · sample session (run a review to see your own)"}
        </p>
        <Boardroom key={latest?.id ?? "sample"} script={buildScript(scene)} advisors={scene.advisors} style="a" />
      </section>
      <AdvisorBench />
      <BoardForm />
      <SessionsList sessions={sessions} />
    </div>
  );
}
