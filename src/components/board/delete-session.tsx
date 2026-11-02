"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteBoardSession } from "@/app/actions/board";
import { Button } from "@/components/ui/button";
import { useFinanceAction } from "@/components/invoices/use-finance-action";

export function DeleteSession({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { run, pending } = useFinanceAction();
  return (
    <Button type="button" variant="ghost" disabled={pending} className="h-11 md:h-9" data-testid="board-delete"
      onClick={() => run(() => deleteBoardSession({ sessionId }), "Session deleted", () => router.push("/board"))}>
      <Trash2 aria-hidden /> Delete
    </Button>
  );
}
