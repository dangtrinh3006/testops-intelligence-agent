"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { AuditFeed, AuditKind, AuditRecord } from "@/lib/types";
import { EvidenceChip } from "../Evidence";
import { buttonClass, Card, CardHeader, cx, ErrorBlock, fmtUtc, LoadingBlock, ModeBadge, Pill, type Tone, VerdictBadge } from "../ui";

// Unified audit feed. Polls every 15 s while the tab is visible and keeps the last snapshot during a refresh.
// Request ids are plain text: the evidence inspector resolves dataset records, not API requests.

const POLL_MS = 15_000;

const KINDS: { kind: AuditKind | null; label: string }[] = [
  { kind: null, label: "All" },
  { kind: "agent.answer", label: "Agent answers" },
  { kind: "human.triage_decision", label: "Human decisions" },
  { kind: "control_plane", label: "Control plane" },
];

const KIND_BADGE: Record<AuditKind, { label: string; tone: Tone }> = {
  "agent.answer": { label: "agent answer", tone: "violet" },
  "human.triage_decision": { label: "human decision", tone: "green" },
  control_plane: { label: "control plane", tone: "amber" },
};

const ACTION_LABEL: Record<string, string> = {
  fix_product: "Fix product",
  fix_test: "Fix test",
  platform_ticket: "Platform ticket",
  propose_quarantine: "Propose quarantine",
  investigate: "Investigate",
};

function useAuditFeed(kind: AuditKind | null) {
  const [state, setState] = useState<{ data?: AuditFeed; kind?: AuditKind | null; error?: Error }>({});
  // Only the latest request may update state, so a slow response for the previous filter cannot overwrite the new one.
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const data = await api.audit(kind);
      if (mine === seq.current) setState({ data, kind });
    } catch (e) {
      if (mine === seq.current) setState((s) => ({ ...s, error: e instanceof Error ? e : new Error(String(e)) }));
    }
  }, [kind]);

  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  return { ...state, reload: load };
}

export function AuditView() {
  const [kind, setKind] = useState<AuditKind | null>(null);
  const { data, kind: loadedKind, error, reload } = useAuditFeed(kind);

  if (!data && error) return <ErrorBlock message={errorMessage(error)} onRetry={reload} />;
  if (!data) return <Card><LoadingBlock rows={6} label="Loading audit log" /></Card>;

  // While a new filter loads, the previous snapshot stays on screen but is narrowed to the chosen kind.
  const entries = data.entries.filter((e) => !kind || e.kind === kind);
  const switching = loadedKind !== kind;

  return (
    <div className="space-y-5">
      <div role="note" className="flex flex-wrap items-start gap-3 rounded-[4px] border border-accent/40 bg-accent/[0.07] px-4 py-3 text-[13px] text-ink">
        <span className="label-mono shrink-0 text-[10.5px] text-accent">Sandbox</span>
        <p className="min-w-0 flex-1 text-muted">
          In-memory for this sandbox: entries reset when the API restarts. A production install writes to an append-only store.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-[4px] border border-block/40 bg-block/[0.07] px-4 py-2.5 text-[13px] text-muted">
          <span className="label-mono mr-2 text-[10.5px] text-block">Refresh failed</span>
          {errorMessage(error)} Showing the last snapshot.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by kind">
        {KINDS.map((k) => (
          <button
            key={k.label}
            type="button"
            aria-pressed={kind === k.kind}
            onClick={() => setKind(k.kind)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 font-mono text-[11.5px] transition-colors",
              kind === k.kind ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {k.label} <span className="text-faint">{k.kind ? data.counts[k.kind] : data.total}</span>
          </button>
        ))}
      </div>

      <Card aria-labelledby="audit-feed-title">
        <CardHeader
          id="audit-feed-title"
          title="Audit entries"
          eyebrow={`${data.total} entries · ring buffer of ${data.capacity} per instance (control plane kept by the fleet) · as of ${data.as_of_utc.slice(11, 19)} UTC`}
          actions={
            <button type="button" onClick={() => void reload()} className={buttonClass("ghost")} aria-label="Refresh audit log now">
              Refresh
            </button>
          }
        >
          Agent answers are recorded by the API after each response; the agent has no tool that writes here.
        </CardHeader>

        {entries.length === 0 ? (
          <div className="px-5 py-8 text-[13px] text-muted" aria-busy={switching}>
            {switching ? (
              <LoadingBlock rows={2} label="Loading entries" />
            ) : (
              <p>
                No {kind ? KINDS.find((k) => k.kind === kind)?.label.toLowerCase() : "entries"} yet since the API started.{" "}
                <Link href="/#ask" className="text-accent underline-offset-2 hover:underline">
                  Ask the agent
                </Link>{" "}
                or decide an item in the{" "}
                <Link href="/triage" className="text-accent underline-offset-2 hover:underline">
                  triage inbox
                </Link>
                .
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Audit entries, scrollable">
            <table className="w-full min-w-[860px] text-[13px]" aria-labelledby="audit-feed-title">
              <thead className="label-mono border-b border-line bg-sunken/50 text-left text-[10px] text-faint">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium sm:px-5">Time (UTC)</th>
                  <th scope="col" className="px-3 py-2 font-medium">Kind</th>
                  <th scope="col" className="px-3 py-2 font-medium">Actor</th>
                  <th scope="col" className="w-[42%] px-3 py-2 font-medium">Summary</th>
                  <th scope="col" className="px-4 py-2 font-medium sm:px-5">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line align-top">
                {entries.map((e) => (
                  <AuditRow key={e.id} e={e} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function AuditRow({ e }: { e: AuditRecord }) {
  const badge = KIND_BADGE[e.kind];
  return (
    <tr>
      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-faint sm:px-5">{fmtUtc(e.ts).replace(" UTC", "")}</td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <Pill tone={badge.tone} mono>{badge.label}</Pill>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-ink">{e.actor}</td>
      <td className="max-w-[30rem] px-3 py-2.5 text-[12.5px] text-muted">
        <Summary e={e} />
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 sm:px-5">
        <Outcome e={e} />
      </td>
    </tr>
  );
}

function Summary({ e }: { e: AuditRecord }) {
  switch (e.kind) {
    case "agent.answer": {
      const d = e.detail;
      return (
        <>
          <span className="line-clamp-2 text-ink" title={d.question}>
            {d.question}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-faint">
            <span title="Request id (search it in the API logs)">{d.request_id}</span>
            <span>· {d.tool_calls} tool call{d.tool_calls === 1 ? "" : "s"}</span>
            {d.revisions > 0 && <span>· {d.revisions} revision</span>}
            {d.verdicts.map((v) => (
              <span key={v.run_id} className="inline-flex items-center gap-1 whitespace-nowrap">
                <EvidenceChip id={v.run_id} />
                <VerdictBadge verdict={v.verdict} size="sm" />
              </span>
            ))}
          </span>
          {d.notice && <span className="mt-1 block text-[11.5px] text-faint">{d.notice}</span>}
        </>
      );
    }
    case "human.triage_decision": {
      const d = e.detail;
      return (
        <>
          <span className="flex flex-wrap items-center gap-1.5">
            <EvidenceChip id={d.test_id} />
            {d.status === "accepted" ? (
              <span className="text-ink">accepted {ACTION_LABEL[d.chosen_action] ?? d.chosen_action}</span>
            ) : (
              <span className="text-ink">
                overrode {ACTION_LABEL[d.suggested_action] ?? d.suggested_action} → {ACTION_LABEL[d.chosen_action] ?? d.chosen_action}
              </span>
            )}
            {d.attempt_id && <EvidenceChip id={d.attempt_id} />}
          </span>
          {d.note && <span className="mt-1 block text-[11.5px] text-faint">“{d.note}”</span>}
        </>
      );
    }
    default: {
      const d = e.detail;
      return (
        <>
          <span className="font-mono text-[11.5px] text-accent">{d.action}</span>{" "}
          <span className="text-ink">{d.target}</span> · {d.note}
        </>
      );
    }
  }
}

function Outcome({ e }: { e: AuditRecord }) {
  if (e.kind === "agent.answer") {
    const d = e.detail;
    return (
      <span className="flex flex-col items-start gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <ModeBadge mode={d.mode} />
          {d.validation_passed ? (
            <Pill tone="green" mono>verified</Pill>
          ) : (
            <Pill tone="red" mono>not verified</Pill>
          )}
        </span>
        {d.failed_checks.length > 0 && (
          <span className="max-w-[16rem] whitespace-normal font-mono text-[10.5px] text-block">{d.failed_checks.join(", ")}</span>
        )}
        <span className="tabular font-mono text-[10.5px] text-faint">
          {d.latency_ms < 1000 ? `${d.latency_ms} ms` : `${(d.latency_ms / 1000).toFixed(1)} s`}
        </span>
      </span>
    );
  }
  if (e.kind === "human.triage_decision") {
    return (
      <Pill tone={e.detail.status === "accepted" ? "green" : "amber"} mono>
        {e.detail.status}
      </Pill>
    );
  }
  return <span className="text-[12px] text-faint">—</span>;
}
