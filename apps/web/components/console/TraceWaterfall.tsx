"use client";

import { useMemo, useState } from "react";
import type { StreamEvent } from "@/lib/stream";
import type { AskResponse, ToolCall } from "@/lib/types";
import { EvidenceChip } from "../Evidence";
import { cx } from "../ui";

// Span view of one agent run, built from the SSE node updates (LangSmith/Langfuse-style waterfall).

type Kind = "run" | "model" | "tool" | "compose" | "validate" | "notice";

type Span = {
  id: string;
  kind: Kind;
  name: string;
  note?: string;
  start: number; // ms from run start
  end: number;
  depth: number;
  tool?: ToolCall;
  failed?: boolean;
};

const KIND: Record<Kind, { glyph: string; label: string; bar: string; text: string }> = {
  run: { glyph: "R", label: "run", bar: "bg-line-strong", text: "text-ink" },
  model: { glyph: "M", label: "model call", bar: "bg-violet/70", text: "text-violet" },
  tool: { glyph: "T", label: "tool", bar: "bg-warn/70", text: "text-warn" },
  compose: { glyph: "C", label: "compose", bar: "bg-accent/75", text: "text-accent" },
  validate: { glyph: "V", label: "validate", bar: "bg-ship/70", text: "text-ship" },
  notice: { glyph: "!", label: "notice", bar: "bg-block/70", text: "text-block" },
};

const LEGEND: Kind[] = ["model", "tool", "compose", "validate"];

function fmtArgs(args: unknown): string {
  try {
    const obj = typeof args === "string" ? (args ? JSON.parse(args) : {}) : args;
    return Object.entries(obj as Record<string, unknown>)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(", ");
  } catch {
    return String(args ?? "");
  }
}

const fmtS = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)} s` : `${Math.round(ms)} ms`);

/** Spans from timed SSE events; null when the events carry no usable timing (replay/offline deliver at once). */
function timedSpans(events: StreamEvent[]): Span[] | null {
  const evs = events.filter((e) => e.type !== "ping" && e.type !== "final");
  const t0 = evs.find((e) => e.type === "start")?.at ?? evs[0]?.at ?? 0;
  const body = evs.filter((e) => e.type !== "start");
  const wall = (body.at(-1)?.at ?? t0) - t0;
  if (!body.some((e) => e.type === "plan") || wall < 300) return null;

  const spans: Span[] = [];
  let prev = t0;
  let modelN = 0;
  body.forEach((e, i) => {
    const at = e.at - t0;
    const from = prev - t0;
    switch (e.type) {
      case "plan": {
        modelN += 1;
        const calls = e.data.tool_calls.map((c) => c.tool).join(", ");
        spans.push({ id: `m${i}`, kind: "model", name: `model call ${modelN}`, note: e.data.ready ? "ready to compose" : `→ ${calls}`, start: from, end: at, depth: 1 });
        break;
      }
      case "tool": {
        const start = Math.max(from, at - e.data.ms);
        spans.push({ id: `t${i}`, kind: "tool", name: e.data.tool, note: e.data.summary, start, end: Math.max(at, start), depth: 2, tool: e.data, failed: !e.data.ok });
        break;
      }
      case "compose":
        spans.push({ id: `c${i}`, kind: "compose", name: e.data.attempt > 1 ? "compose (revision)" : "compose", note: `${e.data.claims} cited claims`, start: from, end: at, depth: 1 });
        break;
      case "validate":
        spans.push({
          id: `v${i}`, kind: "validate", name: "validate", start: from, end: at, depth: 1, failed: !e.data.passed,
          note: e.data.passed ? `${e.data.checks.length}/${e.data.checks.length} checks` : `failed: ${e.data.checks.filter((c) => !c.passed).map((c) => c.name).join(", ")}`,
        });
        break;
      case "notice":
        spans.push({ id: `n${i}`, kind: "notice", name: "notice", note: e.data.message, start: at, end: at, depth: 1, failed: true });
        break;
      default:
        return;
    }
    prev = e.at;
  });
  spans.unshift({ id: "run", kind: "run", name: "agent run", note: "LangGraph", start: 0, end: wall, depth: 0 });
  return spans;
}

/** Recorded order with per-tool timings only; model and validator time is not available here. */
function recordedSpans(res: AskResponse): Span[] {
  let t = 0;
  const spans: Span[] = res.tool_trace.map((tc, i) => {
    const ms = Math.max(tc.ms, 1);
    const s: Span = { id: `t${i}`, kind: "tool", name: tc.tool, note: tc.summary, start: t, end: t + ms, depth: 1, tool: tc, failed: !tc.ok };
    t += ms;
    return s;
  });
  spans.push({
    id: "v", kind: "validate", name: "validate", start: t, end: t, depth: 1, failed: !res.validation.passed,
    note: `${res.validation.checks.filter((c) => c.passed).length}/${res.validation.checks.length} checks`,
  });
  spans.unshift({ id: "run", kind: "run", name: "agent run", note: `${res.mode} mode`, start: 0, end: Math.max(t, 1), depth: 0 });
  return spans;
}

function ticks(total: number): number[] {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000];
  const step = steps.find((s) => total / s <= 5) ?? 60000;
  const out: number[] = [];
  for (let v = 0; v <= total + 0.0001; v += step) out.push(v);
  return out;
}

export function TraceWaterfall({ events, res }: { events: StreamEvent[]; res: AskResponse }) {
  const timed = useMemo(() => timedSpans(events), [events]);
  const spans = useMemo(() => timed ?? recordedSpans(res), [timed, res]);
  const total = Math.max(1, ...spans.map((s) => s.end));
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<string | null>(null);

  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const modelCalls = timed ? spans.filter((s) => s.kind === "model").length : null;
  const toolCalls = spans.filter((s) => s.kind === "tool").length;
  const wall = timed ? total : res.latency_ms;

  return (
    <div className="px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em]">
        {LEGEND.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 rounded-[3px] border border-line px-1.5 py-0.5 text-muted">
            <span aria-hidden className={cx("inline-block h-2 w-3 rounded-[2px]", KIND[k].bar)} />
            {KIND[k].label}
          </span>
        ))}
        <span className="ml-auto flex flex-wrap gap-x-3 gap-y-1 text-faint">
          <span>model calls <b className="tabular-nums text-ink">{modelCalls ?? "—"}</b></span>
          <span>tool calls <b className="tabular-nums text-ink">{toolCalls}</b></span>
          <span>revisions <b className="tabular-nums text-ink">{res.validation.revisions}</b></span>
          <span>wall <b className="tabular-nums text-ink">{fmtS(wall)}</b></span>
        </span>
      </div>
      {!timed && <p className="mb-2 font-mono text-[11px] text-accent">recorded order · tool timings only</p>}

      <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Trace waterfall, scrollable">
        <div className="min-w-[34rem]">
          <div className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)] gap-3 border-b border-line pb-1 font-mono text-[10px] text-faint" aria-hidden>
            <span className="uppercase tracking-[0.1em]">Span</span>
            <span className="relative h-4">
              {ticks(total).map((v) => (
                <span key={v} className="absolute top-0 -translate-x-1/2 tabular-nums" style={{ left: `${(v / total) * 100}%` }}>
                  {fmtS(v)}
                </span>
              ))}
            </span>
          </div>
          <ol aria-label="Trace spans" className="font-mono text-[11.5px]">
            {spans.map((s) => {
              const k = KIND[s.kind];
              const left = (s.start / total) * 100;
              const width = Math.max(((s.end - s.start) / total) * 100, 0.4);
              const expandable = !!s.tool;
              const isOpen = open.has(s.id);
              const label = `${k.label} ${s.name}, ${fmtS(s.end - s.start)}, starts at ${fmtS(s.start)}${s.failed ? ", failed" : ""}`;
              return (
                <li
                  key={s.id}
                  aria-label={label}
                  onMouseEnter={() => setHover(s.id)}
                  onMouseLeave={() => setHover(null)}
                  className={cx("border-b border-line/60 last:border-b-0", hover === s.id && "bg-accent/[0.05]")}
                >
                  <div className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)] items-center gap-3 py-1.5">
                    <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: `${s.depth * 14}px` }}>
                      <span aria-hidden className={cx("grid size-4 shrink-0 place-items-center rounded-[3px] border border-current text-[9px] font-semibold", k.text)}>
                        {k.glyph}
                      </span>
                      {expandable ? (
                        <button type="button" onClick={() => toggle(s.id)} aria-expanded={isOpen} className="min-w-0 truncate text-left text-ink hover:text-accent">
                          <span aria-hidden className="mr-1 text-faint">{isOpen ? "▾" : "▸"}</span>
                          {s.name}
                        </button>
                      ) : (
                        <span className="min-w-0 truncate text-ink">{s.name}</span>
                      )}
                      {s.failed && <span className="shrink-0 text-[10px] uppercase text-block">fail</span>}
                    </div>
                    <div className="relative h-4" aria-hidden>
                      <span
                        className={cx("absolute top-1/2 h-2.5 -translate-y-1/2 rounded-[2px]", k.bar, s.failed && s.kind !== "notice" && "ring-1 ring-block")}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                      <span
                        className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-1 text-[10px] tabular-nums text-faint"
                        style={left + width > 82 ? { right: `${100 - left}%`, paddingRight: 4 } : { left: `${left + width}%` }}
                      >
                        {fmtS(s.end - s.start)}
                      </span>
                    </div>
                  </div>
                  {s.note && !isOpen && <div className="truncate pb-1 text-[10.5px] text-faint" style={{ paddingLeft: `${s.depth * 14 + 22}px` }}>{s.note}</div>}
                  {isOpen && s.tool && (
                    <div className="mb-2 space-y-1.5 rounded-[3px] border border-line bg-canvas/60 p-2.5 text-[11px]" style={{ marginLeft: `${s.depth * 14 + 22}px` }}>
                      <div>
                        <span className="text-faint">args </span>
                        <span className="break-all text-ink">{fmtArgs(s.tool.args) || "—"}</span>
                      </div>
                      <div>
                        <span className="text-faint">result </span>
                        <span className="text-muted">{s.tool.summary}</span>
                      </div>
                      {s.tool.evidence.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-faint">evidence</span>
                          {s.tool.evidence.slice(0, 8).map((id) => (
                            <EvidenceChip key={id} id={id} />
                          ))}
                          {s.tool.evidence.length > 8 && <span className="text-faint">+{s.tool.evidence.length - 8} more</span>}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
