"use client";

import { useMemo, useState } from "react";
import { addDecision, saveChannelTest } from "@/app/actions/growth";
import { formatCalendarDate, formatCents, parseDollarsToCents } from "@/lib/format";
import { dailyBudgetToday, testBudgetCheck, type ChannelStatus, type TestRules } from "@/lib/growth-channels";
import type { GrowthSnapshot } from "@/lib/growth-snapshot";
import { PAID_CHANNELS, channelLabel, channelTestSchema } from "@/lib/schemas/growth";
import type { Tone } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GlassPanel } from "@/components/system/glass-panel";
import { Meter } from "@/components/system/meter";
import { StatusPill } from "@/components/system/status-pill";
import { fieldErrors, useFinanceAction } from "@/components/invoices/use-finance-action";
import { dollarInput, longDate } from "./format";

const cents = (c: number | null) => (c === null ? "—" : formatCents(c, { hideZeroCents: true }));
const statusTone: Record<ChannelStatus, Tone> = { best: "success", ok: "info", loser: "danger", needs_data: "neutral", not_testing: "neutral" };
const statusText: Record<ChannelStatus, string> = { best: "Best so far", ok: "Judged: holding up", loser: "Loser", needs_data: "Needs more data", not_testing: "Not in the test" };
const recTone: Record<string, Tone> = { keep_testing: "info", shift: "warning", scale_add: "success" };
const phaseText = { not_started: "not started", week1: "week 1", after: "after week 1", ended: "window ended" } as const;

/**
 * Channels side by side, the test rules, the budget check against the cash
 * buffer and a recommendation. The recommendation only recommends: nothing
 * changes until you log a decision and change the ads yourself.
 */
export function ChannelTestPanel({ snapshot, canEdit }: { snapshot: GrowthSnapshot; canEdit: boolean }) {
  const t = snapshot.channelTest;
  const { run, pending } = useFinanceAction();
  const [judgeSpend, setJudgeSpend] = useState(dollarInput(t.rules.judgeSpendCents));
  const [judgeLeads, setJudgeLeads] = useState(String(t.rules.judgeLeads));
  const [ratio, setRatio] = useState(String(t.rules.loserRatioX100 / 100));
  const [week1, setWeek1] = useState(dollarInput(t.rules.dailyWeek1Cents));
  const [after, setAfter] = useState(dollarInput(t.rules.dailyAfterCents));
  const [weeks, setWeeks] = useState(String(t.rules.windowWeeks));
  const [start, setStart] = useState(t.rules.startDate ?? "");
  const [channels, setChannels] = useState<string[]>(t.enabledChannels);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [logging, setLogging] = useState(false);
  const [note, setNote] = useState("");

  const cash = snapshot.cash;
  const draft = useMemo((): TestRules | null => {
    const s = parseDollarsToCents(judgeSpend);
    const w1 = parseDollarsToCents(week1);
    const af = parseDollarsToCents(after);
    const wk = Number(weeks);
    if (s === null || w1 === null || af === null || !Number.isInteger(wk) || wk < 1 || wk > 26) return null;
    return { judgeSpendCents: s, judgeLeads: Number(judgeLeads), loserRatioX100: Math.round(Number(ratio) * 100), dailyWeek1Cents: w1, dailyAfterCents: af, windowWeeks: wk, startDate: start === "" ? null : start };
  }, [judgeSpend, judgeLeads, ratio, week1, after, weeks, start]);
  const budget = useMemo(() => {
    if (!draft || !cash) return null;
    const spent = t.rows.filter((r) => channels.includes(r.key)).reduce((a, r) => a + r.spendCents, 0);
    return testBudgetCheck({ rules: draft, enabledCount: channels.length, spentSinceStartCents: spent, cashOnHandCents: cash.onHandCents, bufferCents: cash.bufferCents });
  }, [draft, cash, channels, t.rows]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return setErrors({ form: "Check the dollar amounts and the number of weeks" });
    const input = {
      judgeSpendCents: draft.judgeSpendCents,
      judgeLeads: draft.judgeLeads,
      loserRatioX100: draft.loserRatioX100,
      dailyWeek1Cents: draft.dailyWeek1Cents,
      dailyAfterCents: draft.dailyAfterCents,
      windowWeeks: draft.windowWeeks,
      startDate: draft.startDate,
      channels: PAID_CHANNELS.filter((c) => channels.includes(c)),
    };
    const parsed = channelTestSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    if (budget && !budget.ok) return setErrors({ form: budget.message ?? "That would take cash under the buffer" });
    setErrors({});
    run(() => saveChannelTest(input), "Channel test saved", undefined, (message) => setErrors({ form: message }));
  }

  const rec = t.recommendation;
  const today = snapshot.today;
  const live = dailyBudgetToday(t.rules, today);

  return (
    <div className="space-y-4" data-testid="channel-test">
      <GlassPanel as="section" aria-labelledby="recommendation" className="kc-enter min-w-0 space-y-3 p-5 md:p-6" data-testid="recommendation" data-state={rec.state}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Recommendation (it only recommends)</p>
            <h3 id="recommendation" className="font-heading text-xl font-medium text-ink">{rec.headline}</h3>
          </div>
          <StatusPill tone={recTone[rec.state]}>{{ keep_testing: "Keep testing", shift: "Shift budget", scale_add: "Scale and add" }[rec.state]}</StatusPill>
        </div>
        <p className="text-sm text-ink-muted">{rec.detail}</p>
        {canEdit && (
          <div className="space-y-2">
            {!logging ? (
              <Button type="button" variant="secondary" className="h-11 sm:h-9" onClick={() => setLogging(true)} data-testid="log-recommendation">Log my decision</Button>
            ) : (
              <form
                className="space-y-2"
                aria-label="Log a channel decision"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (note.trim() === "") return setErrors({ note: "Add a note on what you decided" });
                  setErrors({});
                  run(() => addDecision({ date: today, kind: "channel", note, decision: rec.headline }), "Decision logged", () => {
                    setLogging(false);
                    setNote("");
                  });
                }}
              >
                <Label htmlFor="rec-note">What did you decide, and why?</Label>
                <Textarea id="rec-note" value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(errors.note)} />
                {errors.note && <p role="alert" className="text-[12px] text-danger">{errors.note}</p>}
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending} className="h-11 sm:h-9" data-testid="save-recommendation-decision">Save to the decision log</Button>
                  <Button type="button" variant="ghost" className="h-11 sm:h-9" onClick={() => setLogging(false)}>Cancel</Button>
                </div>
              </form>
            )}
          </div>
        )}
      </GlassPanel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="channel-cards">
        {t.rows.map((r) => (
          <GlassPanel key={r.key} as="section" aria-label={`${r.label} channel`} level="flat" className="kc-enter min-w-0 space-y-3 p-4" data-testid={`channel-card-${r.key}`} data-status={r.status}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-heading text-base font-medium text-ink">{r.label}</h3>
              <StatusPill tone={statusTone[r.status]}>{statusText[r.status]}</StatusPill>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-ink-muted">Spend</dt><dd className="text-right text-ink tabular">{cents(r.spendCents)}</dd>
              <dt className="text-ink-muted">Leads</dt><dd className="text-right text-ink tabular">{r.leads}</dd>
              <dt className="text-ink-muted">Booked</dt><dd className="text-right text-ink tabular">{r.booked}</dd>
              <dt className="text-ink-muted">Cost per lead</dt><dd className="text-right text-ink tabular">{cents(r.costPerLeadCents)}</dd>
              <dt className="text-ink-muted">Cost per booked</dt><dd className="text-right font-medium text-ink tabular">{cents(r.costPerBookedCents)}</dd>
            </dl>
            {r.spendCents > 0 || r.enabled ? (
              <div className="space-y-2">
                <div>
                  <Meter value={t.rules.judgeSpendCents > 0 ? r.spendCents / t.rules.judgeSpendCents : 1} tone={r.spendCents >= t.rules.judgeSpendCents ? "success" : "info"} label={`${r.label} spend toward ${cents(t.rules.judgeSpendCents)}`} />
                  <p className="mt-1 text-[12px] text-ink-muted tabular">{cents(r.spendCents)} of {cents(t.rules.judgeSpendCents)} to judge</p>
                </div>
                <div>
                  <Meter value={r.leads / t.rules.judgeLeads} tone={r.leads >= t.rules.judgeLeads ? "success" : "info"} label={`${r.label} leads toward ${t.rules.judgeLeads}`} />
                  <p className="mt-1 text-[12px] text-ink-muted tabular">{r.leads} of {t.rules.judgeLeads} leads to judge</p>
                </div>
              </div>
            ) : null}
            {r.ratioToBest !== null && r.status !== "best" && <p className="text-[12px] text-ink-muted tabular">{r.ratioToBest}x the best channel&apos;s cost per booked client</p>}
            {r.trend && (
              <p className="text-[12px] text-ink-muted tabular">
                Cost per lead {cents(r.trend.priorCplCents)} then {cents(r.trend.recentCplCents)} over the last two weeks{r.trend.rising ? ": rising" : ""}.
              </p>
            )}
          </GlassPanel>
        ))}
      </div>

      <GlassPanel as="section" aria-labelledby="test-rules" className="min-w-0 space-y-4 p-5 md:p-6">
        <div>
          <h3 id="test-rules" className="font-heading text-base font-medium text-ink">Test rules and budget</h3>
          <p className="text-[13px] text-ink-muted tabular" data-testid="test-summary">
            Today&apos;s budget per channel: {cents(live.cents)} ({phaseText[live.phase]}).
            {t.windowEndsOn ? ` Window ends ${longDate(t.windowEndsOn)}.` : " No start date set."}
            {t.budget ? ` ${cents(t.budget.remainingCents)} still planned; ${cents(Math.max(0, t.budget.roomCents))} of cash is above the buffer.` : ""}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate aria-label="Channel test rules">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5"><Label htmlFor="ct-spend">Judge a channel after ($ spent)</Label><Input id="ct-spend" inputMode="decimal" value={judgeSpend} onChange={(e) => setJudgeSpend(e.target.value)} disabled={!canEdit} className="h-11 md:h-9" /></div>
            <div className="space-y-1.5"><Label htmlFor="ct-leads">and this many leads</Label><Input id="ct-leads" inputMode="numeric" value={judgeLeads} onChange={(e) => setJudgeLeads(e.target.value)} disabled={!canEdit} className="h-11 md:h-9" />{errors.judgeLeads && <p role="alert" className="text-[12px] text-danger">{errors.judgeLeads}</p>}</div>
            <div className="space-y-1.5"><Label htmlFor="ct-ratio">Loser at this many times the best cost per booked client</Label><Input id="ct-ratio" inputMode="decimal" value={ratio} onChange={(e) => setRatio(e.target.value)} disabled={!canEdit} className="h-11 md:h-9" />{errors.loserRatioX100 && <p role="alert" className="text-[12px] text-danger">{errors.loserRatioX100}</p>}</div>
            <div className="space-y-1.5"><Label htmlFor="ct-weeks">Test window (weeks)</Label><Input id="ct-weeks" inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.target.value)} disabled={!canEdit} className="h-11 md:h-9" />{errors.windowWeeks && <p role="alert" className="text-[12px] text-danger">{errors.windowWeeks}</p>}</div>
            <div className="space-y-1.5"><Label htmlFor="ct-w1">Daily budget per channel, week 1 ($)</Label><Input id="ct-w1" inputMode="decimal" value={week1} onChange={(e) => setWeek1(e.target.value)} disabled={!canEdit} className="h-11 md:h-9" /></div>
            <div className="space-y-1.5"><Label htmlFor="ct-after">Daily budget after week 1 ($)</Label><Input id="ct-after" inputMode="decimal" value={after} onChange={(e) => setAfter(e.target.value)} disabled={!canEdit} className="h-11 md:h-9" /></div>
            <div className="space-y-1.5"><Label htmlFor="ct-start">Test start date</Label><Input id="ct-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={!canEdit} className="h-11 md:h-9" /></div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-ink">Channels in the test</legend>
              {PAID_CHANNELS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-ink">
                  <Checkbox checked={channels.includes(c)} onCheckedChange={(v) => setChannels((cur) => (v === true ? [...cur, c] : cur.filter((x) => x !== c)))} disabled={!canEdit} aria-label={`Test ${channelLabel[c]}`} />
                  {channelLabel[c]}
                </label>
              ))}
            </fieldset>
          </div>
          {budget && (
            <p className={budget.ok ? "text-[13px] text-ink-muted tabular" : "text-[13px] font-medium text-danger"} data-testid={budget.ok ? "budget-ok" : "budget-warning"} role={budget.ok ? undefined : "alert"}>
              {budget.ok
                ? `Planned ${cents(budget.plannedCents)} (${cents(budget.remainingCents)} still to spend) fits in the ${cents(Math.max(0, budget.roomCents))} of cash above your buffer.`
                : budget.message}
            </p>
          )}
          {!cash && <p className="text-[13px] text-ink-muted">The cash check needs payout figures, so it runs for the owner or an admin when saving.</p>}
          {errors.form && <p role="alert" className="text-[13px] text-danger" data-testid="channel-test-error">{errors.form}</p>}
          {canEdit ? (
            <Button type="submit" disabled={pending || (budget !== null && !budget.ok)} className="h-11 sm:h-9" data-testid="save-channel-test">{pending ? "Saving…" : "Save test"}</Button>
          ) : (
            <p className="text-[13px] text-ink-muted">Only the owner or an admin can change the test.</p>
          )}
          {t.rules.startDate && <p className="text-[12px] text-ink-muted">Started {formatCalendarDate(t.rules.startDate)}. Numbers above count from that day.</p>}
        </form>
      </GlassPanel>
    </div>
  );
}
