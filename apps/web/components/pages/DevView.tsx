"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Attribution, CheckConclusion, CommitRow } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { TriagePill } from "../Attempts";
import { EvidenceChip } from "../Evidence";
import { Markdown } from "../Markdown";
import { buttonClass, Card, CardHeader, cx, ErrorBlock, LoadingBlock, Skeleton, VerdictBadge } from "../ui";

// Developer workspace: "did my change break it?" per commit, plus the PR check and CI gate it would produce.

const ATTRIBUTION: Record<Attribution, { label: string; hint: string; tone: string }> = {
  likely_this_change: { label: "Likely this change", hint: "Fails on this commit, not explained by flake history or infrastructure", tone: "text-block" },
  known_flaky: { label: "Known flaky", hint: "Test has flake evidence in the window (R3)", tone: "text-accent" },
  infrastructure: { label: "Infrastructure", hint: "System issue, never counted against the test (R1)", tone: "text-warn" },
  unknown: { label: "Unknown", hint: "No terminal result or not enough evidence (R6)", tone: "text-violet" },
};

const CONCLUSION: Record<CheckConclusion, { label: string; className: string; glyph: string }> = {
  success: { label: "Success", className: "border-ship/50 bg-ship/10 text-ship", glyph: "✓" },
  neutral: { label: "Neutral", className: "border-line-strong bg-sunken text-muted", glyph: "–" },
  action_required: { label: "Action required", className: "border-accent/60 bg-accent/10 text-accent", glyph: "!" },
  failure: { label: "Failure", className: "border-block/50 bg-block/10 text-block", glyph: "✕" },
};

export function DevView() {
  const params = useSearchParams();
  const router = useRouter();
  const commits = useApi("commits:20", () => api.commits(20));
  const selected = params.get("commit") ?? commits.data?.[0]?.commit ?? null;

  const select = (sha: string) => router.replace(`/dev?commit=${encodeURIComponent(sha)}`, { scroll: false });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <CommitList state={commits} selected={selected} onSelect={select} />
      <div className="min-w-0">
        {selected ? <CommitDetail sha={selected} /> : !commits.loading && <EmptyHint />}
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <Card>
      <p className="p-5 text-sm text-muted">Pick a commit on the left to see which failures it plausibly caused and what its PR check would say.</p>
    </Card>
  );
}

function CommitList({
  state,
  selected,
  onSelect,
}: {
  state: ReturnType<typeof useApi<CommitRow[]>>;
  selected: string | null;
  onSelect: (sha: string) => void;
}) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = state.data ?? [];
    if (!needle) return all;
    return all.filter((c) => [c.commit, c.branch, ...c.service_ids].some((v) => v.toLowerCase().includes(needle)));
  }, [state.data, q]);

  return (
    <Card aria-labelledby="commits-title" className="self-start">
      <div className="border-b border-line px-4 py-3">
        <h2 id="commits-title" className="label-mono text-[10.5px] text-faint">
          Recent commits
        </h2>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by sha, branch, service"
          aria-label="Filter commits"
          className="mt-2 block w-full rounded-[3px] border border-line-strong bg-canvas px-2.5 py-1.5 font-mono text-[12px] text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
        />
      </div>
      {state.loading && (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}
      {state.error && (
        <div className="p-3">
          <ErrorBlock message={errorMessage(state.error)} onRetry={state.reload} />
        </div>
      )}
      {!state.loading && !state.error && rows.length === 0 && <p className="p-4 text-[13px] text-muted">No commits match “{q}”.</p>}
      <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto" aria-label="Commits">
        {rows.map((c) => {
          const active = c.commit === selected;
          return (
            <li key={c.commit}>
              <button
                type="button"
                onClick={() => onSelect(c.commit)}
                aria-current={active ? "true" : undefined}
                className={cx(
                  "block w-full px-4 py-2.5 text-left transition-colors focus-visible:outline-offset-[-2px]",
                  active ? "bg-accent/10 shadow-[inset_2px_0_0_var(--accent)]" : "hover:bg-sunken/60",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[12px] text-ink">{c.commit.slice(0, 7)}</span>
                  <span className="min-w-0 truncate font-mono text-[11px] text-faint">{c.branch}</span>
                  <span className="ml-auto shrink-0">
                    <VerdictBadge verdict={c.worst_verdict} size="sm" />
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                  {c.service_ids.join(", ")} · {c.runs} run{c.runs === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function CommitDetail({ sha }: { sha: string }) {
  const { data, error, loading, reload } = useApi(`commit:${sha}`, () => api.commit(sha));
  const [picked, setPicked] = useState<{ sha: string; run: string } | null>(null);

  if (loading) return <Card><LoadingBlock rows={5} label={`Assessing ${sha.slice(0, 7)}`} /></Card>;
  if (error || !data) return <ErrorBlock message={errorMessage(error)} onRetry={reload} />;

  const runId = picked?.sha === sha ? picked.run : data.runs[0]?.run_id;
  const attributions = Object.keys(ATTRIBUTION) as Attribution[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-mono text-[18px] text-ink">{data.commit.slice(0, 7)}</h2>
        <span className="font-mono text-[12px] text-faint">{data.branch}</span>
        <span className="text-[12.5px] text-muted">
          {data.runs.length} run{data.runs.length === 1 ? "" : "s"} · {data.assessment.length} failing or unsettled test{data.assessment.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {attributions.map((a) => (
          <div key={a} className="rounded-[4px] border border-line bg-surface p-4" title={ATTRIBUTION[a].hint}>
            <div className="label-mono text-[10.5px] text-faint">{ATTRIBUTION[a].label}</div>
            <div className={cx("tabular mt-2 font-serif text-[28px] leading-none", data.summary[a] ? ATTRIBUTION[a].tone : "text-ink")}>{data.summary[a] ?? 0}</div>
            <div className="mt-2 text-[11.5px] leading-snug text-muted">{ATTRIBUTION[a].hint}</div>
          </div>
        ))}
      </div>

      <Card aria-labelledby="runs-of-commit">
        <CardHeader id="runs-of-commit" title="Runs on this commit" eyebrow="Select a run for its PR check" />
        <ul className="divide-y divide-line" aria-label="Runs">
          {data.runs.map((r) => (
            <li key={r.run_id}>
              <button
                type="button"
                onClick={() => setPicked({ sha, run: r.run_id })}
                aria-pressed={r.run_id === runId}
                className={cx("flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left sm:px-5", r.run_id === runId ? "bg-accent/[0.07]" : "hover:bg-sunken/60")}
              >
                <span className="font-mono text-[12px] text-ink">{r.run_id}</span>
                <span className="font-mono text-[11px] text-faint">{r.service_id}</span>
                <span className="font-mono text-[11px] text-faint">{r.queued_utc?.replace("T", " ").replace("Z", " UTC") ?? "queued time unknown"}</span>
                <span className="ml-auto">
                  <VerdictBadge verdict={r.verdict} size="sm" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="assessment-title">
        <CardHeader id="assessment-title" title="Did this change break it?" eyebrow="Attribution per failing test" />
        {data.assessment.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted">Every test on this commit reached a passing final attempt. Nothing to attribute.</p>
        ) : (
          <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Failing test attribution, scrollable">
            <table className="w-full min-w-[760px] text-[13px]" aria-labelledby="assessment-title">
              <thead className="label-mono border-b border-line bg-sunken/50 text-left text-[10px] text-faint">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium sm:px-5">Test</th>
                  <th scope="col" className="px-3 py-2 font-medium">Run</th>
                  <th scope="col" className="px-3 py-2 font-medium">Attribution</th>
                  <th scope="col" className="px-3 py-2 font-medium">Defect</th>
                  <th scope="col" className="px-3 py-2 font-medium">Reason</th>
                  <th scope="col" className="px-4 py-2 font-medium sm:px-5">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line align-top">
                {data.assessment.map((row) => (
                  <tr key={`${row.run_id}:${row.test_id}`}>
                    <td className="px-4 py-2.5 sm:px-5">
                      <EvidenceChip id={row.test_id} />
                      <div className="mt-1 max-w-[14rem] truncate text-[11.5px] text-muted" title={row.name}>
                        {row.name}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11.5px] text-muted">{row.run_id}</td>
                    <td className={cx("whitespace-nowrap px-3 py-2.5 font-medium", ATTRIBUTION[row.attribution].tone)}>{ATTRIBUTION[row.attribution].label}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{row.defect ? <TriagePill code={row.defect.code} label={row.defect.label} /> : <span className="text-faint">—</span>}</td>
                    <td className="max-w-[22rem] px-3 py-2.5 text-[12.5px] text-muted">{row.reason}</td>
                    <td className="px-4 py-2.5 sm:px-5">
                      <span className="flex flex-wrap gap-1">
                        {row.evidence.slice(0, 4).map((id) => (
                          <EvidenceChip key={id} id={id} />
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {runId && (
        <div className="grid gap-5 xl:grid-cols-2">
          <CheckPreview runId={runId} />
          <GateInCi runId={runId} />
        </div>
      )}
    </div>
  );
}

function CheckPreview({ runId }: { runId: string }) {
  const { data, error, loading, reload } = useApi(`check:${runId}`, () => api.check(runId));
  return (
    <Card aria-labelledby="check-title" className="min-w-0">
      <CardHeader
        id="check-title"
        title="PR check preview"
        eyebrow={runId}
        actions={data ? <CopyButton text={data.summary_markdown} label="Copy markdown" /> : undefined}
      />
      {loading && <LoadingBlock rows={4} label="Building check" />}
      {error && (
        <div className="p-4">
          <ErrorBlock message={errorMessage(error)} onRetry={reload} />
        </div>
      )}
      {data && (
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 rounded-[4px] border border-line bg-canvas px-3 py-2.5">
            <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px]", CONCLUSION[data.conclusion].className)}>
              <span aria-hidden>{CONCLUSION[data.conclusion].glyph}</span>
              {CONCLUSION[data.conclusion].label}
            </span>
            <span className="min-w-0 text-[13px] font-medium text-ink">{data.title}</span>
            <span className="ml-auto font-mono text-[10.5px] text-faint">
              testops / release-gate · {data.policy_id} · rules {data.rules_version}
            </span>
          </div>
          <div className="mt-3 font-mono text-[11px] text-faint">
            {data.counts.tests} tests · {data.counts.failed} failed · {data.counts.retried} retried · {data.counts.incomplete} incomplete
          </div>
          <div className="mt-3 max-h-[26rem] overflow-y-auto rounded-[3px] border border-line bg-surface px-4 py-3">
            <Markdown source={data.summary_markdown} />
          </div>
        </div>
      )}
    </Card>
  );
}

function GateInCi({ runId }: { runId: string }) {
  const cli = `python services/agent-api/scripts/testops_gate.py --api https://testops.dangtrinh.dev --run ${runId}`;
  const action = `- name: Release gate (TestOps)
  run: |
    python services/agent-api/scripts/testops_gate.py \\
      --api https://testops.dangtrinh.dev \\
      --run "\${{ env.TESTOPS_RUN_ID }}"`;
  const codes: [string, string][] = [
    ["0", "SHIP or SHIP_WITH_WARNINGS"],
    ["1", "BLOCK"],
    ["2", "HOLD_MANUAL_REVIEW"],
    ["3", "API or input error (fail closed)"],
  ];
  return (
    <Card aria-labelledby="gate-ci-title" className="min-w-0">
      <CardHeader id="gate-ci-title" title="Gate this in CI" eyebrow="Shift left: the same policy, before merge">
        The CLI asks the API for the policy verdict and exits with a code your pipeline can act on. Read-only.
      </CardHeader>
      <div className="space-y-4 p-4 sm:p-5">
        <Snippet label="CLI" code={cli} />
        <div>
          <div className="label-mono mb-1.5 text-[10px] text-faint">Exit codes</div>
          <dl className="grid grid-cols-[2rem_1fr] gap-x-2 gap-y-1 font-mono text-[12px]">
            {codes.map(([code, meaning]) => (
              <div key={code} className="contents">
                <dt className="text-accent">{code}</dt>
                <dd className="text-muted">{meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
        <Snippet label="GitHub Actions step" code={action} />
      </div>
    </Card>
  );
}

function Snippet({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="label-mono text-[10px] text-faint">{label}</span>
        <CopyButton text={code} label="Copy" />
      </div>
      <pre className="overflow-x-auto whitespace-pre rounded-[3px] border border-line bg-canvas px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink">{code}</pre>
    </div>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 1800);
  };
  return (
    <button type="button" onClick={copy} className={buttonClass("ghost", "sm")} aria-live="polite">
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </button>
  );
}
