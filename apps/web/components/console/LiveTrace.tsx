"use client";

import { useEffect, useState } from "react";
import type { StreamEvent } from "@/lib/stream";

// Live view of one agent run: the LangGraph nodes light up as real node updates arrive over SSE.

type NodeKey = "agent" | "tools" | "compose" | "validate";
const NODES: { key: NodeKey; label: string; hint: string }[] = [
  { key: "agent", label: "Agent", hint: "model plans the next tool call" },
  { key: "tools", label: "Tools", hint: "read-only, bounded, deterministic" },
  { key: "compose", label: "Compose", hint: "answer with cited record ids" },
  { key: "validate", label: "Validate", hint: "ids · numbers · verdict = policy" },
];

function nodeOf(e: StreamEvent): NodeKey | null {
  if (e.type === "plan") return "agent";
  if (e.type === "tool") return "tools";
  if (e.type === "compose") return "compose";
  if (e.type === "validate") return "validate";
  return null;
}

/** The node that is working now, from the last finished node and the graph's edges. */
function nextNode(last: StreamEvent | undefined): NodeKey | null {
  if (!last) return "agent";
  switch (last.type) {
    case "plan":
      return last.data.ready ? "compose" : "tools";
    case "tool":
      return "agent";
    case "compose":
      return "validate";
    case "validate":
      return last.data.will_revise ? "compose" : null;
    default:
      return "agent";
  }
}

function fmtArgs(raw: unknown): string {
  try {
    const obj = typeof raw === "string" ? (raw ? JSON.parse(raw) : {}) : raw;
    return Object.entries(obj as Record<string, unknown>)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(", ");
  } catch {
    return String(raw ?? "");
  }
}

function line(e: StreamEvent): { node: string; text: string; tone?: "ok" | "bad" | "warn" } | null {
  switch (e.type) {
    case "start":
      return { node: "run", text: e.data.streaming ? `request ${e.data.request_id} · ${e.data.model ?? "no model"} · streaming node updates` : `request ${e.data.request_id} · ${e.data.mode} mode · trace delivered at once` };
    case "plan":
      return e.data.ready
        ? { node: "agent", text: `has enough evidence · model call ${e.data.model_calls}` }
        : { node: "agent", text: `call ${e.data.tool_calls.map((c) => `${c.tool}(${fmtArgs(c.args)})`).join(", ")} · model call ${e.data.model_calls}` };
    case "tool":
      return { node: "tools", text: `${e.data.ok ? "✓" : "✗"} ${e.data.tool} · ${e.data.ms} ms · ${e.data.summary}`, tone: e.data.ok ? "ok" : "bad" };
    case "compose":
      return { node: "compose", text: `${e.data.attempt > 1 ? "revision" : "draft"} with ${e.data.claims} cited claims` };
    case "validate": {
      const failed = e.data.checks.filter((c) => !c.passed);
      return e.data.passed
        ? { node: "validate", text: `✓ ${e.data.checks.length}/${e.data.checks.length} checks passed`, tone: "ok" }
        : { node: "validate", text: `✗ ${failed.map((c) => c.name).join(", ")}${e.data.will_revise ? " · sending back for one revision" : " · shown with flags"}`, tone: "warn" };
    }
    case "notice":
      return { node: "run", text: e.data.message, tone: "warn" };
    case "error":
      return { node: "run", text: e.data.message, tone: "bad" };
    default:
      return null;
  }
}

export function LiveTrace({ events, running, startedAt }: { events: StreamEvent[]; running: boolean; startedAt: number | null }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  const visible = events.filter((e) => e.type !== "ping" && e.type !== "final");
  const last = [...events].reverse().find((e) => nodeOf(e));
  const active: NodeKey | null = running ? nextNode(last) : null;
  const counts = {
    agent: events.filter((e) => e.type === "plan").length,
    tools: events.filter((e) => e.type === "tool").length,
    compose: events.filter((e) => e.type === "compose").length,
    validate: events.filter((e) => e.type === "validate").length,
  };
  const elapsed = startedAt != null ? ((running ? now : (events.at(-1)?.at ?? 0) + startedAt) - startedAt) / 1000 : 0;
  const streaming = events.find((e) => e.type === "start")?.data as { streaming?: boolean } | undefined;

  return (
    <section aria-label="Agent run" className="overflow-hidden rounded border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
        <span className="text-accent">Agent run</span>
        <span>{streaming?.streaming === false ? "recorded / deterministic trace" : "live · LangGraph node updates over SSE"}</span>
        <span className="ml-auto tabular-nums">{elapsed.toFixed(1)} s</span>
      </div>
      <ol className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4" aria-label="Graph nodes">
        {NODES.map((n, i) => {
          const isActive = active === n.key;
          const done = counts[n.key] > 0;
          return (
            <li key={n.key} className={`relative bg-surface px-4 py-3 ${isActive ? "bg-[rgba(255,184,74,0.08)]" : ""}`} aria-current={isActive ? "step" : undefined}>
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em]">
                <span className={isActive ? "text-accent" : done ? "text-ink" : "text-faint"}>{String(i + 1).padStart(2, "0")} · {n.label}</span>
                {isActive && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />}
                {counts[n.key] > 0 && <span className="ml-auto tabular-nums text-faint">×{counts[n.key]}</span>}
              </div>
              <p className="mt-1 text-xs text-muted">{n.hint}</p>
            </li>
          );
        })}
      </ol>
      <ol className="max-h-72 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed" aria-live="polite">
        {visible.length === 0 && <li className="text-faint">Waiting for the first node update…</li>}
        {visible.map((e, i) => {
          const l = line(e);
          if (!l) return null;
          return (
            <li key={i} className="grid grid-cols-[4.5rem_5.5rem_1fr] gap-2">
              <span className="tabular-nums text-faint">+{(e.at / 1000).toFixed(1)}s</span>
              <span className="uppercase tracking-[0.08em] text-accent">{l.node}</span>
              <span className={l.tone === "bad" ? "text-red-400" : l.tone === "warn" ? "text-amber-300" : l.tone === "ok" ? "text-ink" : "text-muted"}>{l.text}</span>
            </li>
          );
        })}
        {running && <li className="mt-1 text-faint">… model thinking (keep-alive every 5 s)</li>}
      </ol>
    </section>
  );
}
