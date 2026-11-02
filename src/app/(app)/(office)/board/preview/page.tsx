import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { financeContext } from "@/lib/finance-auth";
import { momentOf } from "@/lib/board/scene/player";
import { MOCK_SCENE } from "@/lib/board/scene/mock";
import { buildScript } from "@/lib/board/scene/script";
import { PageHeader } from "@/components/shell/page-header";
import { StatusPill } from "@/components/system/status-pill";
import { Boardroom, StyleSwitcher } from "@/components/board/scene/boardroom";
import { STYLES, type SceneStyle } from "@/components/board/scene/styles";

export const metadata: Metadata = { title: "Boardroom preview" };
export const dynamic = "force-dynamic";

const MOMENTS = ["opening", "debate", "verdict"] as const;

/** A static, animated mock of the live boardroom: sample data, no model calls. Owner and admin only. */
export default async function BoardPreviewPage({ searchParams }: { searchParams: Promise<{ moment?: string; style?: string }> }) {
  const ctx = await financeContext();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin) redirect("/command-center");
  const { moment, style } = await searchParams;
  const current: SceneStyle = STYLES.find((x) => x.key === style)?.key ?? "a";
  const script = buildScript(MOCK_SCENE);
  // ?moment=opening|debate|verdict starts paused at that moment (used for screenshots and tests).
  const m = MOMENTS.find((x) => x === moment);
  const start = m ? { ...momentOf(script, m), paused: true } : { beat: 0, progress: 0, paused: false };
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-5 px-4 py-6 md:px-6">
      <Link href="/board" className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-3.5" aria-hidden /> Roast Room
      </Link>
      <PageHeader eyebrow="Roast Room" title="Boardroom preview" description={<span className="inline-flex flex-wrap items-center gap-2">A sample session with made-up answers. No AI is called. <StatusPill tone="info">Sample data</StatusPill></span>} />
      <StyleSwitcher current={current} moment={m} />
      <Boardroom key={current} script={script} advisors={MOCK_SCENE.advisors} style={current} start={start} />
    </div>
  );
}
