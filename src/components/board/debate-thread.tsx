"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { ArrowDown, Pause, Play, RotateCcw } from "lucide-react";

/**
 * Roast Room transcript on assistant-ui primitives.
 *
 * Boundary (intentional): the debate is replayed from the saved session's real
 * advisor answers. No model is called here; the "streaming" is a client-side
 * reveal over an external-store runtime, so cost stays exactly what the
 * session already spent. Swapping in a live run later only means feeding
 * `messages` + `isRunning` from a streaming source instead of the reveal timer.
 */
export type DebateEntry = {
  id: string;
  speaker: string;
  lens: string;
  round: number;
  text: string;
  kind: "question" | "advisor" | "chair";
};

type Meta = { speaker: string; lens: string; round: number; kind: DebateEntry["kind"] };

const CHARS_PER_TICK = 18;
const TICK_MS = 28;

export function DebateThread({ entries, title = "Debate transcript" }: { entries: DebateEntry[]; title?: string }) {
  const total = entries.length;
  const [shown, setShown] = useState(1); // messages visible (last one may be mid-stream)
  const [chars, setChars] = useState(0); // chars of the last visible message
  const [playing, setPlaying] = useState(true);

  const done = shown >= total && chars >= (entries[total - 1]?.text.length ?? 0);

  useEffect(() => {
    if (!playing || done || total === 0) return;
    const t = setTimeout(() => {
      const cur = entries[shown - 1];
      if (chars < cur.text.length) setChars((c) => Math.min(cur.text.length, c + CHARS_PER_TICK));
      else if (shown < total) {
        setShown((s) => s + 1);
        setChars(0);
      }
    }, chars >= (entries[shown - 1]?.text.length ?? 0) ? 450 : TICK_MS);
    return () => clearTimeout(t);
  }, [playing, done, shown, chars, entries, total]);

  const messages = useMemo<ThreadMessageLike[]>(
    () =>
      entries.slice(0, shown).map((e, i) => ({
        id: e.id,
        role: e.kind === "question" ? "user" : "assistant",
        content: [{ type: "text", text: i === shown - 1 ? e.text.slice(0, chars) : e.text }],
        metadata: { custom: { speaker: e.speaker, lens: e.lens, round: e.round, kind: e.kind } satisfies Meta },
      })),
    [entries, shown, chars],
  );

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    isRunning: playing && !done,
    convertMessage: (m) => m,
    onNew: async () => {},
  });

  const skip = () => {
    setShown(total);
    setChars(entries[total - 1]?.text.length ?? 0);
    setPlaying(false);
  };
  const restart = () => {
    setShown(1);
    setChars(0);
    setPlaying(true);
  };

  if (total === 0) return null;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section aria-labelledby="debate-thread" className="glass-card space-y-4 rounded-md border p-6" data-testid="board-debate-thread">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium tracking-[0.1em] text-ink-muted uppercase">Roast Room · transcript</p>
            <h2 id="debate-thread" className="font-heading text-lg font-medium text-ink">{title}</h2>
            <p className="text-[12px] text-ink-muted">
              {done ? `${total} turns · replayed from saved answers` : `Streaming turn ${shown} of ${total}…`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {!done && (
              <button type="button" onClick={() => setPlaying((p) => !p)} className="glass-flat inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] text-ink hover:bg-surface-raised" aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {playing ? "Pause" : "Play"}
              </button>
            )}
            {!done && (
              <button type="button" onClick={skip} className="glass-flat h-8 rounded-md border px-2.5 text-[12px] text-ink hover:bg-surface-raised">Show all</button>
            )}
            <button type="button" onClick={restart} className="glass-flat inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] text-ink hover:bg-surface-raised">
              <RotateCcw className="size-3.5" /> Replay
            </button>
          </div>
        </div>

        <ThreadPrimitive.Root className="relative">
          <ThreadPrimitive.Viewport className="max-h-[600px] space-y-4 overflow-y-auto pr-2">
            <ThreadPrimitive.Messages>{() => <DebateMessage />}</ThreadPrimitive.Messages>
            <ThreadPrimitive.If running>
              <div className="flex items-center gap-2 pl-1 text-[12px] text-ink-muted" aria-live="polite">
                <span className="inline-flex gap-1">
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                  <span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
                </span>
                The floor is open…
              </div>
            </ThreadPrimitive.If>
          </ThreadPrimitive.Viewport>
          <ThreadPrimitive.ScrollToBottom className="glass-popover absolute right-2 bottom-2 inline-flex size-8 items-center justify-center rounded-full border text-ink disabled:invisible" aria-label="Jump to latest">
            <ArrowDown className="size-4" />
          </ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.Root>
      </section>
    </AssistantRuntimeProvider>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

function DebateMessage() {
  return (
    <MessagePrimitive.Root className="kc-enter">
      <MessageBody />
    </MessagePrimitive.Root>
  );
}

function MessageBody() {
  const meta = useAuiState((s) => (s.message.metadata?.custom ?? {}) as Partial<Meta>);
  const speaker = meta.speaker ?? "";
  const kind = meta.kind ?? "advisor";
  if (kind === "question") {
    return (
      <div className="flex justify-end">
        <div className="glass-popover max-w-[min(620px,90%)] space-y-1.5 rounded-md border px-4 py-3">
          <p className="text-[11px] font-medium tracking-[0.08em] text-ink-muted uppercase">Question to the board</p>
          <div className="text-sm whitespace-pre-wrap text-ink"><MessagePrimitive.Parts /></div>
        </div>
      </div>
    );
  }
  const isChair = kind === "chair";
  return (
    <div className="flex gap-3">
      <div
        aria-hidden
        className={
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium " +
          (isChair ? "border-primary/50 bg-primary text-primary-foreground" : "glass-flat text-ink")
        }
      >
        {initials(speaker)}
      </div>
      <div
        className={
          "min-w-0 max-w-[min(720px,100%)] flex-1 space-y-2 rounded-md border px-4 py-3 " +
          (isChair ? "glass-card border-primary/40 ring-1 ring-primary/30" : "glass-flat")
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-ink">{speaker}</span>
          {isChair ? (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-px text-[10px] font-medium tracking-[0.08em] text-primary uppercase">Verdict</span>
          ) : meta.round ? (
            <span className="rounded-full border px-2 py-px text-[10px] font-medium tabular-nums text-ink-muted">R{meta.round}</span>
          ) : null}
          {meta.lens && <span className="min-w-0 truncate text-[12px] text-ink-muted">{meta.lens}</span>}
        </div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-ink"><MessagePrimitive.Parts /></div>
      </div>
    </div>
  );
}
