"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { useKnowledge, useOverview, useRun } from "@/lib/hooks";
import type { GateCheck, OutcomeView, RunResponse } from "@/lib/types";
import { AttemptTimeline } from "../Attempts";
import { EvidenceChip } from "../Evidence";
import { buttonClass, cx, ErrorBlock, LoadingBlock, Pill, StatusChip, statusTone, VerdictBadge } from "../ui";

function conflictTests(check: GateCheck, run: RunResponse): OutcomeView[] {
  const ids = new Set([...check.detail.matchAll(/(T-[A-Z]+-\d+) final=/g)].map((m) => m[1]));
  const tests = run.details.tests_needing_attention;
  const hit = tests.filter((t) => ids.has(t.test_id));
  return hit.length ? hit : tests.filter((t) => t.suite === "critical");
}

// Twin = another release candidate of the same service, else the previous run of the same pipeline.
function twinRunId(runId: string, serviceId: string | undefined, rcs: { run_id: string; service_id: string }[] | undefined): string | null {
  const rc = rcs?.find((r) => r.service_id === serviceId && r.run_id !== runId);
  if (rc) return rc.run_id;
  const m = /^(.*-)(\d+)$/.exec(runId);
  if (!m) return null;
  const n = Number(m[2]) - 1;
  return n > 0 ? `${m[1]}${String(n).padStart(m[2]!.length, "0")}` : null;
}

export function SourceConflict({ runId, check }: { runId: string; check: GateCheck }) {
  const run = useRun(runId);
  const knowledge = useKnowledge();
  const overview = useOverview();
  const [showTwin, setShowTwin] = useState(false);

  const r5 = knowledge.data?.rules.find((r) => r.id === check.rule);
  const summary = run.data?.details.ci_summary;
  const tests = run.data ? conflictTests(check, run.data) : [];
  const twin = run.data ? twinRunId(runId, run.data.details.run.service_id, overview.data?.release_candidates) : null;
  const rcOf = (id: string) => overview.data?.release_candidates.find((r) => r.run_id === id);

  return (
    <section aria-labelledby="conflict-title" className="overflow-hidden rounded-[4px] border border-accent/45 bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-accent/25 bg-accent/[0.06] px-4 py-2 sm:px-5">
        <span className="label-mono text-accent">Gate check · summary_conflict · rule {check.rule}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusChip tone="amber" dot>
            hold · operator gate
          </StatusChip>
          <EvidenceChip id={runId} />
        </span>
      </div>
      <div className="border-b border-line px-4 py-4 sm:px-5">
        <h2 id="conflict-title" className="font-serif text-[24px] leading-tight tracking-[-0.02em] text-ink sm:text-[28px]">
          Source conflict: the CI summary <em className="italic text-accent">disagrees</em> with the test runner
        </h2>
      </div>

      {run.error && <ErrorBlock message={errorMessage(run.error)} onRetry={run.reload} />}
      {run.loading && <LoadingBlock label="Loading run evidence" rows={4} />}

      {run.data && (
        <div className="p-4 sm:p-5">
          <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1.35fr]">
            <div className="flex flex-col rounded-[4px] border border-line bg-canvas/50">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
                <span className="label-mono text-ink">CI summary</span>
                <StatusChip>advisory</StatusChip>
              </div>
              <div className="flex-1 p-4">
                {summary ? (
                  <>
                    <dl className="grid grid-cols-2 gap-4">
                      <div>
                        <dt className="label-mono text-[10px] text-faint">Status (raw)</dt>
                        <dd className="mt-1 font-mono text-[15px] text-ink">&quot;{summary.status_raw}&quot;</dd>
                      </div>
                      <div>
                        <dt className="label-mono text-[10px] text-faint">Normalised</dt>
                        <dd className="mt-1">
                          <Pill tone={statusTone(summary.status)} mono className="text-[13px]">
                            {summary.status}
                          </Pill>
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-4">
                      <div className="label-mono mb-1 text-[10px] text-faint">Event</div>
                      <EvidenceChip id={summary.event_id} />
                    </div>
                    <p className="mt-4 text-[13px] text-muted">One webhook for the whole run. It reports the pipeline, not each test&apos;s final attempt.</p>
                  </>
                ) : (
                  <p className="text-sm text-muted">No CI summary event.</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 py-1 lg:flex-col lg:py-0" aria-hidden>
              <span className="h-px w-10 bg-accent/40 lg:h-10 lg:w-px" />
              <span className="flex size-11 items-center justify-center rounded-full border border-accent bg-accent/10 font-serif text-[26px] leading-none text-accent">
                ≠
              </span>
              <span className="h-px w-10 bg-accent/40 lg:h-10 lg:w-px" />
            </div>
            <span className="sr-only">does not match</span>

            <div className="flex flex-col rounded-[4px] border border-accent/40 bg-canvas/50">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-accent/25 px-4 py-2">
                <span className="label-mono text-ink">Test runner</span>
                <StatusChip tone="amber">source of truth</StatusChip>
              </div>
              <div className="space-y-4 p-4">
                {tests.map((t) => (
                  <AttemptTimeline key={t.test_id} outcome={t} />
                ))}
              </div>
            </div>
          </div>

          <figure className="mt-5 border-l-2 border-accent pl-4 sm:pl-5">
            <figcaption className="label-mono flex flex-wrap items-center gap-2 text-faint">
              <span className="text-accent">{check.rule}</span>
              <span aria-hidden>·</span>
              <span className="text-ink">{r5?.title ?? "Source-of-truth precedence"}</span>
            </figcaption>
            {r5?.rationale && (
              <blockquote className="mt-2 font-serif text-[19px] italic leading-relaxed text-ink sm:text-[21px]">“{r5.rationale}”</blockquote>
            )}
            {r5?.effect && <p className="mt-2 max-w-3xl text-[13.5px] text-muted">{r5.effect}</p>}
          </figure>

          {twin && (
            <div className="mt-5 border-t border-line pt-5">
              {!showTwin ? (
                <button type="button" className={buttonClass("primary", "md")} onClick={() => setShowTwin(true)} aria-expanded={false}>
                  Same rule, other run → <span className="normal-case tracking-normal">{rcOf(twin)?.id ?? twin}</span>
                </button>
              ) : (
                <TwinComparison
                  thisRun={run.data}
                  thisTests={tests}
                  twinId={twin}
                  twinRc={rcOf(twin)?.id}
                  thisRc={rcOf(runId)?.id}
                  onHide={() => setShowTwin(false)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TwinComparison({
  thisRun,
  thisTests,
  twinId,
  twinRc,
  thisRc,
  onHide,
}: {
  thisRun: RunResponse;
  thisTests: OutcomeView[];
  twinId: string;
  twinRc?: string;
  thisRc?: string;
  onHide: () => void;
}) {
  const twin = useRun(twinId);
  const ids = new Set(thisTests.map((t) => t.test_id));

  return (
    <div className="rounded-[4px] border border-line" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-sunken/50 px-4 py-2.5">
        <h3 className="font-serif text-[17px] leading-snug text-ink">Same policy, same test, same CI summary — different runner evidence</h3>
        <button type="button" className={buttonClass("ghost")} onClick={onHide} aria-expanded>
          Hide
        </button>
      </div>
      {twin.loading && <LoadingBlock label="Loading comparison run" rows={3} />}
      {twin.error && <ErrorBlock message={errorMessage(twin.error)} onRetry={twin.reload} />}
      {twin.data && (
        <div className="grid gap-px bg-line md:grid-cols-2">
          <RunColumn title={thisRc ?? thisRun.details.run.run_id} run={thisRun} tests={thisTests} />
          <RunColumn
            title={twinRc ?? twinId}
            run={twin.data}
            tests={twin.data.details.tests_needing_attention.filter((t) => ids.has(t.test_id) || t.suite === "critical")}
          />
        </div>
      )}
    </div>
  );
}

function captionFor(run: RunResponse): string {
  const on = (c: string) => run.gate.checks.some((x) => x.condition === c && x.triggered);
  if (on("summary_conflict")) return "The summary's status is contradicted by the final attempts, so the run is unverifiable.";
  if (on("incomplete_gating_test")) return "A gating test has no terminal attempt; its outcome is unknown, not assumed.";
  if (on("unresolved_failure")) return "A gating test failed on its final attempt.";
  if (on("retry_pass_in_gating")) return "The final attempt passed after a retry and the summary agrees: eligible, with a warning.";
  return "Every gating test passed and the summary agrees.";
}

function RunColumn({ title, run, tests }: { title: string; run: RunResponse; tests: OutcomeView[] }) {
  const caption = captionFor(run);
  const g = run.gate;
  const s = run.details.ci_summary;
  const decisive = g.checks.find((c) => c.triggered);
  return (
    <div className="bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-serif text-[20px] leading-tight text-ink">{title}</div>
          <EvidenceChip id={run.details.run.run_id} />
        </div>
        <VerdictBadge verdict={g.verdict} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted">
        <span className="label-mono text-[10px] text-faint">CI summary</span>
        <Pill tone={statusTone(s?.status)} mono>
          {s?.status ?? "missing"}
        </Pill>
        <span aria-hidden className="text-faint">·</span>
        <span>
          rule <span className="text-ink">{g.deciding_rule}</span>
        </span>
        <span aria-hidden className="text-faint">·</span>
        <span>{g.policy_id}</span>
      </div>
      <div className="space-y-3">
        {tests.map((t) => (
          <AttemptTimeline key={t.test_id} outcome={t} compact />
        ))}
      </div>
      {decisive && (
        <p className={cx("mt-3 rounded-[3px] border border-line bg-canvas/60 px-3 py-2 text-xs text-ink")}>
          <span className="font-mono text-accent">{decisive.condition}</span>: {decisive.detail}
        </p>
      )}
      <p className="mt-2 font-serif text-[15px] italic text-muted">{caption}</p>
    </div>
  );
}
