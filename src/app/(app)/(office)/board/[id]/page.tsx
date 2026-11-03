import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { financeContext } from "@/lib/finance-auth";
import { getBoardSession } from "@/lib/board/data";
import { formatNyDateTime } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { DeleteSession } from "@/components/board/delete-session";
import { SessionView } from "@/components/board/session-view";

export const metadata: Metadata = { title: "Roast Room session" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BoardSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await financeContext();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin) redirect("/command-center");
  if (!UUID.test(id)) notFound();
  const session = await getBoardSession(ctx.supabase, id);
  if (!session) notFound();
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-6 px-4 py-6 md:px-6">
      <Link href="/board" className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-3.5" aria-hidden /> Roast Room
      </Link>
      <PageHeader eyebrow="Roast Room" title="Session" description={formatNyDateTime(session.created_at)} actions={<DeleteSession sessionId={session.id} />} />
      <SessionView session={session} />
    </div>
  );
}
