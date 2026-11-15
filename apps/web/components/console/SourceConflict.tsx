"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { useKnowledge, useOverview, useRun } from "@/lib/hooks";
import type { GateCheck, OutcomeView, RunResponse } from "@/lib/types";
import { AttemptTimeline } from "../Attempts";
import { EvidenceChip } from "../Evidence";
import { buttonClass, cx, ErrorBlock, LoadingBlock, Pill, statusTone, VerdictBadge } from "../ui";

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
    <section
      aria-labelledby="conflict-title"
      className="overflow-hidden rounded-xl border-2 border-amber-400/70 bg-surface dark:border-amber-500/50"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300/60 bg-amber-50 px-4 py-3 sm:px-5 dark:border-amber-500/30 dark:bg-amber-500/10">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            Gate check · summary_conflict · rule {check.rule}
          </div>
          <h2 id="conflict-title" className="text-base font-semibold text-ink">
            Source conflict: the CI summary disagrees with the test runner
          </h2>
        </div>
        <EvidenceChip id={runId} />
      </div>

      {run.error && <ErrorBlock message={errorMessage(run.error)} onRetry={run.reload} />}
      {run.loading && <LoadingBlock label="Loading run evidence" rows={4} />}

      {run.data && (
        <div className="p-4 sm:p-5">
          <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1.35fr]">
            <div className="rounded-lg border border-line bg-sunken/60 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">CI summary</span>
                <Pill>advisory</Pill>
              </div>
              {summary ? (
                <>
                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-[11px] text-faint">Status (raw)</dt>
                      <dd className="font-mono text-sm text-ink">&quot;{summary.status_raw}&quot;</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-faint">Normalised</dt>
                      <dd>
                        <Pill tone={statusTone(summary.status)} mono className="text-sm">
                          {summary.status}
                        </Pill>
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    <div className="text-[11px] text-faint">Event</div>
                    <EvidenceChip id={summary.event_id} />
                  </div>
                  <p className="mt-3 text-xs text-muted">One webhook for the whole run. It reports the pipeline, not each test&apos;s final attempt.</p>
                </>
              ) : (
                <p className="text-sm text-muted">No CI summary event.</p>
              )}
            </div>

            <div className="flex items-center justify-center" aria-hidden>
              <span className="flex size-12 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-50 text-2xl font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                ≠
              </span>
            </div>
            <span className="sr-only">does not match</span>

            <div className="rounded-lg border-2 border-ink/80 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">Test runner</span>
                <Pill tone="violet">source of truth</Pill>
              </div>
              <div className="space-y-4">
                {tests.map((t) => (
                  <AttemptTimeline key={t.test_id} outcome={t} />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-line bg-sunken/60 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Pill mono tone="violet">
                {check.rule}
              </Pill>
              <span className="font-semibold text-ink">{r5?.title ?? "Source-of-truth precedence"}</span>
            </div>
            {r5?.rationale && <p className="mt-1 text-muted">{r5.rationale}</p>}
            {r5?.effect && <p className="mt-1 text-ink">{r5.effect}</p>}
          </div>

          {twin && (
            <div className="mt-4">
              {!showTwin ? (
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => setShowTwin(true)} aria-expanded={false}>
                  Same rule, other run → <span className="font-mono text-xs">{rcOf(twin)?.id ?? twin}</span>
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
    <div className="rounded-xl border border-line" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h3 className="text-sm font-semibold text-ink">Same policy, same test, same CI summary — different runner evidence</h3>
        <button type="button" className={buttonClass("ghost")} onClick={onHide} aria-expanded>
          Hide
        </button>
      </div>
      {twin.loading && <LoadingBlock label="Loading comparison run" rows={3} />}
      {twin.error && <ErrorBlock message={errorMessage(twin.error)} onRetry={twin.reload} />}
      {twin.data && (
        <div className="grid gap-px bg-line md:grid-cols-2">
          <RunColumn
            title={thisRc ?? thisRun.details.run.run_id}
            run={thisRun}
            tests={thisTests}
          />
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
          <div className="font-mono text-sm font-semibold text-ink">{title}</div>
          <EvidenceChip id={run.details.run.run_id} />
        </div>
        <VerdictBadge verdict={g.verdict} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>CI summary</span>
        <Pill tone={statusTone(s?.status)} mono>
          {s?.status ?? "missing"}
        </Pill>
        <span aria-hidden>·</span>
        <span>
          rule <span className="font-mono font-semibold text-ink">{g.deciding_rule}</span>
        </span>
        <span aria-hidden>·</span>
        <span className="font-mono">{g.policy_id}</span>
      </div>
      <div className="space-y-3">
        {tests.map((t) => (
          <AttemptTimeline key={t.test_id} outcome={t} compact />
        ))}
      </div>
      {decisive && (
        <p className={cx("mt-3 rounded-md bg-sunken px-3 py-2 text-xs text-ink")}>
          <span className="font-mono">{decisive.condition}</span>: {decisive.detail}
        </p>
      )}
      <p className="mt-2 text-xs text-muted">{caption}</p>
    </div>
  );
}
