"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useOverview } from "@/lib/hooks";
import { idKind } from "@/lib/ids";
import type { AskResponse } from "@/lib/types";
import { EvidenceChip } from "../Evidence";
import { cx, VerdictBadge } from "../ui";

// Hero product window: plays back the recorded scenario C run (real response, re-checked against today's data),
// paced for reading. Labelled as a replay; the console below runs it live.

type Verb = "ATTACH" | "READ" | "REASON" | "VERIFY" | "GATE";
type Line = { verb: Verb; text: string; ids: string[] };

const VERB_STYLE: Record<Verb, string> = {
  ATTACH: "text-ink",
  READ: "text-warn",
  REASON: "text-violet",
  VERIFY: "text-ship",
  GATE: "text-accent",
};

const STEP_MS = 900;

function argsText(args: Record<string, unknown>): string {
  return Object.values(args)
    .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
    .join(", ");
}

function buildLines(res: AskResponse): Line[] {
  const lines: Line[] = [{ verb: "ATTACH", text: `agent testops-analyst · scope read-only · ${res.tool_trace.length} tool calls`, ids: [] }];
  for (const t of res.tool_trace) {
    lines.push({ verb: "READ", text: `${t.tool}(${argsText(t.args)}) → ${t.summary}`, ids: t.evidence });
  }
  lines.push({ verb: "REASON", text: `${res.claims.length} claims drafted, each citing record ids`, ids: [] });
  const checks = res.validation.checks;
  const passed = checks.filter((c) => c.passed).length;
  lines.push({ verb: "VERIFY", text: `validator ${passed}/${checks.length} · ids resolve · numbers grounded · verdict = policy`, ids: [] });
  if (res.gate) {
    lines.push({ verb: "GATE", text: `${res.gate.verdict} · rule ${res.gate.deciding_rule} · ${res.gate.policy_id}`, ids: [res.gate.policy_id] });
  }
  return lines;
}

function clock(base: number, offsetMs: number): string {
  const d = new Date(base + offsetMs);
  return `${d.toISOString().slice(11, 23)}`;
}

export function HeroConsole({ onRunLive }: { onRunLive: () => void }) {
  const overview = useOverview();
  const question = overview.data?.presets?.find((p) => p.id === "C")?.question ?? null;
  const [res, setRes] = useState<AskResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [reduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (!question) return;
    const ctrl = new AbortController();
    api
      .ask({ question, mode: "replay", scenario: "C" }, ctrl.signal)
      .then((r) => {
        setRes(r);
        setStartedAt(Date.now());
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true);
      });
    return () => ctrl.abort();
  }, [question]);

  const lines = useMemo(() => (res ? buildLines(res) : []), [res]);
  const evidence = useMemo(() => {
    const seen: string[] = [];
    for (const t of res?.tool_trace ?? []) for (const id of t.evidence) if (!seen.includes(id)) seen.push(id);
    return seen;
  }, [res]);

  // Progress is derived from elapsed time, so a replay only resets the start timestamp.
  const elapsed = startedAt == null || now < startedAt ? 0 : now - startedAt;
  const shown = reduced ? lines.length : Math.min(lines.length, Math.floor(elapsed / STEP_MS) + 1);
  const ticking = startedAt != null && !reduced && shown < lines.length;
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 150);
    return () => window.clearInterval(id);
  }, [ticking]);

  const play = () => {
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
  };
  const base = startedAt ?? 0;

  const visibleIds = new Set(lines.slice(0, shown).flatMap((l) => l.ids));
  const done = lines.length > 0 && shown >= lines.length;
  const active = lines[Math.min(shown, lines.length - 1)];

  return (
    <figure
      aria-label="Replayed agent run for scenario C"
      className="overflow-hidden rounded-[6px] border border-line-strong bg-[#100c08] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,184,74,0.04)]"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </span>
        <span className="ml-1 font-serif text-[15px] text-ink">
          TestOps<em className="text-accent">Agent</em>
        </span>
        <span className="rounded-[3px] border border-line px-1.5 py-px font-mono text-[10.5px] text-muted">payments-api 2.14.0 · read-only</span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em]">
          <span className="rounded-[3px] border border-ship/40 px-1.5 py-px text-ship">rules decide</span>
          <span className="flex items-center gap-1 text-violet">
            <span aria-hidden className="size-1.5 rounded-full bg-violet" />
            replay
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 font-mono text-[11px]">
        <span className="grid size-5 place-items-center rounded-[3px] border border-accent/50 text-accent">C</span>
        <span className="text-ink">conflicting-evidence</span>
        <span className="text-faint">{res ? res.request_id : "…"}</span>
        <span className="ml-auto rounded-[3px] border border-accent/40 px-1.5 py-px text-accent">gate: deterministic · verify</span>
      </div>

      <div className="grid min-h-[17rem] grid-cols-1 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div className="hidden border-r border-line sm:block">
          <div className="label-mono border-b border-line px-3 py-2 text-[10px] text-faint">Evidence substrate</div>
          <ul className="space-y-1 px-3 py-2.5">
            {(evidence.length ? evidence : Array.from({ length: 6 }, (_, i) => `…${i}`)).slice(0, 9).map((id) => {
              const on = visibleIds.has(id);
              return (
                <li key={id} className={cx("flex items-center gap-2 font-mono text-[11px] transition-opacity duration-500", on ? "opacity-100" : "opacity-30")}>
                  <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", on ? "bg-accent" : "bg-line-strong")} />
                  <span className="min-w-0 truncate text-ink">{id.startsWith("…") ? "loading" : id}</span>
                  <span className="ml-auto shrink-0 text-[9.5px] uppercase text-faint">{id.startsWith("…") ? "" : idKind(id)}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="min-w-0">
          <div className="label-mono flex items-center border-b border-line px-3 py-2 text-[10px] text-faint">
            Run · event stream
            <span aria-hidden className="ml-auto flex gap-1">
              {lines.map((_, i) => (
                <span key={i} className={cx("h-[3px] w-3 rounded-full transition-colors", i < shown ? "bg-accent" : "bg-line-strong")} />
              ))}
            </span>
          </div>
          <ol className="space-y-1.5 px-3 py-2.5 font-mono text-[11.5px] leading-snug" aria-live="off">
            {failed && <li className="text-muted">Replay unavailable. Use the console below.</li>}
            {!res && !failed && <li className="text-faint">Loading recorded run…</li>}
            {lines.slice(0, shown).map((l, i) => (
              <li key={i} className="grid grid-cols-[5.6rem_4rem_minmax(0,1fr)] gap-2 motion-safe:animate-[fadein_.35s_ease-out]">
                <span className="tabular text-faint">{clock(base, i * STEP_MS)}</span>
                <span className={cx("font-semibold", VERB_STYLE[l.verb])}>{l.verb}</span>
                <span className="min-w-0 break-words text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden" title={l.text}>
                  {l.text}
                </span>
              </li>
            ))}
            {res && active && !done && (
              <li className="grid grid-cols-[5.6rem_4rem_minmax(0,1fr)] gap-2 text-faint">
                <span />
                <span className={cx(VERB_STYLE[active.verb], "opacity-60")}>{active.verb}</span>
                <span className="motion-safe:animate-pulse">…</span>
              </li>
            )}
          </ol>
        </div>
      </div>

      <div className="border-t border-line bg-surface/60 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span className="grid size-5 place-items-center rounded-[3px] bg-accent/15 text-accent">◆</span>
          <span className="text-ink">release gate · verifying against rules R1–R6</span>
          <span className="ml-auto label-mono text-[10px] text-faint">Decision</span>
        </div>
        <div className="mt-2 flex min-h-[2.25rem] flex-wrap items-center gap-2">
          {done && res?.gate ? (
            <>
              <VerdictBadge verdict={res.gate.verdict} size="sm" />
              <span className="font-mono text-[11.5px] text-muted">rule {res.gate.deciding_rule} ·</span>
              {res.gate.checks
                .filter((c) => c.triggered)
                .map((c) => (
                  <span key={c.condition} className="rounded-[3px] border border-accent/35 px-1.5 py-px font-mono text-[11px] text-accent">
                    {c.condition}
                  </span>
                ))}
              <span className="flex flex-wrap gap-1">
                <EvidenceChip id={res.gate.run_id} />
                <EvidenceChip id={res.gate.policy_id} />
              </span>
            </>
          ) : (
            <span className="font-mono text-[12px] text-faint">{res ? "verifying…" : "—"}</span>
          )}
        </div>
      </div>

      <figcaption className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2.5 font-mono text-[10.5px] text-faint">
        <span>Recorded live run, re-checked against today&apos;s data · paced for reading</span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={play} disabled={!res} className="uppercase tracking-[0.08em] text-muted hover:text-accent disabled:opacity-50">
            ↻ Replay
          </button>
          <button type="button" onClick={onRunLive} className="uppercase tracking-[0.08em] text-accent hover:text-accent-hover">
            Run it live →
          </button>
        </span>
      </figcaption>
    </figure>
  );
}
