"use client";

import { Children, Fragment, type ReactNode } from "react";
import { idKind, splitIds } from "@/lib/ids";
import { useInspector } from "./inspector-context";
import { cx } from "./ui";

const KIND_STYLE: Record<string, string> = {
  run: "text-accent border-accent/30 bg-accent/[0.06]",
  "release candidate": "text-accent border-accent/30 bg-accent/[0.06]",
  attempt: "text-ink border-line-strong bg-sunken",
  "raw event": "text-ink border-line-strong bg-sunken",
  "CI summary": "text-warn border-warn/30 bg-warn/[0.06]",
  log: "text-muted border-line-strong bg-sunken",
  finding: "text-block border-block/30 bg-block/[0.06]",
  test: "text-ship border-ship/30 bg-ship/[0.06]",
  policy: "text-violet border-violet/30 bg-violet/[0.06]",
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
        "mx-0.5 inline-flex max-w-full items-center gap-1 rounded-[3px] border px-1.5 py-px align-baseline font-mono text-[0.76rem] leading-5 transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent-hover",
        missing ? "border-block/45 bg-block/10 text-block line-through" : (KIND_STYLE[kind] ?? KIND_STYLE.attempt),
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
