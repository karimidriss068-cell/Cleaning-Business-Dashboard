"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { runBoardSession } from "@/app/actions/board";
import { ADVISORS, AI_LABEL, DEFAULT_ADVISORS, type AdvisorKey } from "@/lib/board/advisors";
import { estimateSession } from "@/lib/board/estimate";
import { boardRunSchema, MAX_QUESTION_CHARS } from "@/lib/schemas/board";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { Bust } from "@/components/board/scene/bust";
import { fieldErrors } from "@/components/invoices/use-finance-action";

const ROUNDS = [
  { value: "1", label: "1 round (default)" },
  { value: "2", label: "2 rounds (they answer each other)" },
];

/** Question, advisors, rounds and the cost estimate. Running takes up to a minute, then opens the saved session. */
export function BoardForm() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [picked, setPicked] = useState<AdvisorKey[]>([...DEFAULT_ADVISORS]);
  const [rounds, setRounds] = useState<"1" | "2">("1");
  const [useContext, setUseContext] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);

  const estimate = useMemo(
    () => estimateSession({ questionChars: Math.min(question.trim().length || 200, MAX_QUESTION_CHARS), advisors: picked, rounds: rounds === "2" ? 2 : 1, useContext }),
    [question, picked, rounds, useContext],
  );

  function toggle(key: AdvisorKey, on: boolean) {
    setPicked((cur) => ADVISORS.map((a) => a.key).filter((k) => (k === key ? on : cur.includes(k))));
  }

  async function run() {
    const input = { question, advisors: picked, rounds: rounds === "2" ? 2 : 1, useContext };
    const parsed = boardRunSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setRunning(true);
    const r = await runBoardSession(parsed.data);
    if (!r.ok) {
      setRunning(false);
      return void toast.error(r.message);
    }
    if (r.notice) (r.partial ? toast.warning : toast.info)(r.notice);
    else toast.success("The advisors have answered");
    router.push(`/board/${r.sessionId}`);
  }

  return (
    <GlassPanel as="section" aria-labelledby="board-form-title" className="kc-enter space-y-5 p-5" data-testid="board-form">
      <div>
        <h2 id="board-form-title" className="font-heading text-lg font-medium text-ink">Ask the advisors</h2>
        <p className="text-[13px] text-ink-muted" data-testid="board-ai-label">{AI_LABEL}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="board-question">Your business question or decision</Label>
        <Textarea id="board-question" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={running} aria-invalid={Boolean(errors.question)} aria-describedby="board-question-help"
          placeholder="Example: Should I hire a part-time closer for residential leads, or spend the same money on Google ads?" className="min-h-32" />
        <div id="board-question-help" className="flex flex-wrap justify-between gap-2 text-[12px]">
          <span className={errors.question ? "text-danger" : "text-ink-muted"} role={errors.question ? "alert" : undefined}>{errors.question ?? "Include your options, numbers and which way you are leaning."}</span>
          <span className={`tabular ${question.length > MAX_QUESTION_CHARS ? "text-danger" : "text-ink-muted"}`}>{question.length.toLocaleString("en-US")} / {MAX_QUESTION_CHARS.toLocaleString("en-US")}</span>
        </div>
      </div>

      <fieldset className="space-y-2" disabled={running}>
        <legend className="text-sm font-medium text-ink">Advisors <span className="font-normal text-ink-muted">({picked.length} picked)</span></legend>
        <div className="grid gap-2 sm:grid-cols-2" data-testid="board-advisors">
          {ADVISORS.map((a) => (
            <GlassPanel key={a.key} level="flat" as="label" className="flex cursor-pointer items-start gap-3 p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <Checkbox checked={picked.includes(a.key)} onCheckedChange={(c) => toggle(a.key, c === true)} aria-label={a.name} className="mt-0.5" />
              <Bust who={a.key} state={picked.includes(a.key) ? "thinking" : "idle"} className="size-12 shrink-0" alt="" />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">{a.name}{DEFAULT_ADVISORS.includes(a.key) && <StatusPill tone="info">Default</StatusPill>}</span>
                <span className="block text-[12px] text-ink-muted">{a.question}</span>
              </span>
            </GlassPanel>
          ))}
        </div>
        {errors.advisors && <p className="text-[12px] text-danger" role="alert">{errors.advisors}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Rounds</Label>
          <Select items={ROUNDS} value={rounds} onValueChange={(v) => v && setRounds(v === "2" ? "2" : "1")} disabled={running}>
            <SelectTrigger className="h-11 w-full md:h-9" aria-label="Rounds"><SelectValue /></SelectTrigger>
            <SelectContent>{ROUNDS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <label className="flex cursor-pointer items-start gap-3 self-end pb-1 text-sm text-ink">
          <Checkbox checked={useContext} onCheckedChange={(c) => setUseContext(c === true)} disabled={running} aria-label="Include a snapshot of my business numbers" className="mt-0.5" />
          <span>Include a snapshot of my business numbers <span className="block text-[12px] text-ink-muted">Goal, pace, tier, profit, channel test, cash and gates. No customer or contact data.</span></span>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
        <p className="text-sm text-ink-muted" data-testid="board-estimate">
          Estimated cost: up to <span className="font-medium text-ink"><AnimatedNumber value={estimate.cents} kind="cents" /></span> for {estimate.calls} AI {estimate.calls === 1 ? "call" : "calls"}.
          <span className="block text-[12px]">Advisors use the small model and the synthesis the larger one. An identical question within 24 hours is reused for free.</span>
        </p>
        <Button type="button" onClick={run} disabled={running || picked.length === 0} className="h-11 md:h-9" data-testid="board-run">
          {running ? <><Loader2 className="animate-spin" aria-hidden /> The advisors are thinking…</> : <><Play aria-hidden /> Run the review</>}
        </Button>
      </div>
      {running && <p className="text-[13px] text-ink-muted" role="status">This takes up to a minute. You can leave this page open; the result is saved when it finishes.</p>}
    </GlassPanel>
  );
}
