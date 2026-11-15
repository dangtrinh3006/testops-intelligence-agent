"use client";

import { Children, Fragment, type ReactNode } from "react";
import { idKind, splitIds } from "@/lib/ids";
import { useInspector } from "./inspector-context";
import { cx } from "./ui";

const KIND_STYLE: Record<string, string> = {
  run: "text-indigo-800 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-500/15 ring-indigo-600/20 dark:ring-indigo-400/30",
  attempt: "text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-500/20 ring-slate-500/25 dark:ring-slate-400/30",
  "CI summary": "text-sky-900 dark:text-sky-100 bg-sky-50 dark:bg-sky-500/15 ring-sky-600/20 dark:ring-sky-400/30",
  log: "text-stone-800 dark:text-stone-100 bg-stone-100 dark:bg-stone-500/20 ring-stone-500/25 dark:ring-stone-400/30",
  finding: "text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-500/15 ring-amber-600/25 dark:ring-amber-400/30",
  test: "text-teal-900 dark:text-teal-100 bg-teal-50 dark:bg-teal-500/15 ring-teal-600/20 dark:ring-teal-400/30",
  policy: "text-violet-900 dark:text-violet-100 bg-violet-50 dark:bg-violet-500/15 ring-violet-600/20 dark:ring-violet-400/30",
  "release candidate": "text-indigo-900 dark:text-indigo-100 bg-indigo-50 dark:bg-indigo-500/15 ring-indigo-600/20 dark:ring-indigo-400/30",
};

export function EvidenceChip({ id, missing, label }: { id: string; missing?: boolean; label?: string }) {
  const { open } = useInspector();
  const kind = idKind(id);
  return (
    <button
      type="button"
      onClick={() => open(id)}
      title={missing ? `${id} — not found in current data` : `Inspect ${kind} ${id}`}
      aria-label={`Inspect ${kind} ${id}${missing ? " (missing)" : ""}`}
      className={cx(
        "mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-px align-baseline font-mono text-[0.78rem] leading-5 ring-1 ring-inset transition hover:brightness-95 hover:ring-2 dark:hover:brightness-125",
        missing ? "bg-red-50 text-red-800 line-through ring-red-500/40 dark:bg-red-500/10 dark:text-red-200" : (KIND_STYLE[kind] ?? KIND_STYLE.attempt),
      )}
    >
      <span className="break-all text-left">{label ?? id}</span>
    </button>
  );
}

export function ChipList({ ids, missing }: { ids: string[]; missing?: Set<string> }) {
  if (ids.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {ids.map((id) => (
        <EvidenceChip key={id} id={id} missing={missing?.has(id)} />
      ))}
    </span>
  );
}

export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {splitIds(text).map((p, i) =>
        p.type === "id" ? <EvidenceChip key={i} id={p.value} /> : <Fragment key={i}>{p.value}</Fragment>,
      )}
    </>
  );
}

export function linkify(children: ReactNode): ReactNode {
  return Children.map(children, (c) => (typeof c === "string" ? <LinkifiedText text={c} /> : c));
}
