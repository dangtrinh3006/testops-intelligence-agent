"use client";

import { api } from "@/lib/api";
import { useOverview } from "@/lib/hooks";
import type { RunRow } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useInspector } from "../inspector-context";
import { Card, cx, Skeleton, VerdictBadge } from "../ui";

// Release overview: live numbers from the API only; nothing on this page is hard-coded.

export function OverviewHeader() {
  const { data } = useOverview();
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div>
        <h1 className="font-serif text-[30px] leading-tight tracking-[-0.02em] text-ink">Release overview</h1>
        <p className="mt-1 text-[13.5px] text-muted">Gate verdicts are computed by the policy function; the agent explains them with cited records.</p>
      </div>
      <p className="font-mono text-[11px] text-faint">
        {data ? <>Data as of {data.as_of.replace("T", " ").replace("Z", " UTC")} · source {data.source}</> : <Skeleton className="h-3 w-56" />}
      </p>
    </div>
  );
}

export function KpiRow() {
  const overview = useOverview();
  const flaky = useApi("flaky", () => api.flaky());
  const evals = useApi("evals", () => api.evals());
  const o = overview.data;
  const rcs = o?.release_candidates ?? [];
  const held = rcs.filter((r) => r.verdict !== "SHIP").length;
  const flakyCount = flaky.data?.flaky.tests.filter((t) => t.level === "proven" || t.level === "suspected").length;
  const live = evals.data?.reports?.live ?? (evals.data?.mode === "live" ? evals.data : undefined);
  const passK = live?.summary?.passed != null && live.summary.total ? Math.round((live.summary.passed / live.summary.total) * 100) : null;

  const tiles: { label: string; value: React.ReactNode; sub: React.ReactNode; tone?: string }[] = [
    { label: "Release candidates", value: o ? rcs.length : null, sub: o ? `${held} held or blocked by the gate` : null, tone: held ? "text-accent" : undefined },
    { label: "CI runs · 30 days", value: o?.totals.runs ?? null, sub: o ? `${o.totals.attempts.toLocaleString("en-US")} test attempts` : null },
    { label: "Flaky tests", value: flakyCount ?? null, sub: flaky.data ? "proven or suspected (R3)" : null },
    { label: "Data-quality findings", value: o?.totals.findings ?? null, sub: o ? `${o.totals.raw_events.toLocaleString("en-US")} raw events ingested` : null },
    {
      label: "Agent reliability",
      value: passK != null ? `${passK}%` : null,
      sub: live ? `pass^${live.repeat ?? 1} on ${live.summary?.total ?? 0} eval cases` : null,
    },
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-[4px] border border-line bg-surface p-4">
          <div className="label-mono text-[10.5px] text-faint">{t.label}</div>
          <div className={cx("tabular mt-2 font-serif text-[28px] leading-none tracking-[-0.02em] text-ink", t.tone)}>
            {t.value ?? <Skeleton className="h-7 w-14" />}
          </div>
          <div className="mt-2 min-h-[1rem] text-[12px] text-muted">{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

export function RecentRuns() {
  const { data, loading } = useOverview();
  const { open } = useInspector();
  const rows: RunRow[] = data?.latest_runs ?? [];
  return (
    <Card aria-labelledby="runs-title">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <h2 id="runs-title" className="font-serif text-[1.15rem] tracking-[-0.01em] text-ink">
          Latest run per pipeline
        </h2>
        <span className="font-mono text-[11px] text-faint">click a row to inspect</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="label-mono border-b border-line bg-sunken/50 text-left text-[10px] text-faint">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium sm:px-5">Run</th>
              <th scope="col" className="px-3 py-2 font-medium">Service</th>
              <th scope="col" className="px-3 py-2 font-medium">Commit</th>
              <th scope="col" className="px-3 py-2 font-medium">Queued (UTC)</th>
              <th scope="col" className="px-3 py-2 font-medium">CI summary</th>
              <th scope="col" className="px-4 py-2 font-medium sm:px-5">Gate verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading &&
              [0, 1, 2, 3].map((i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-5 py-3">
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))}
            {rows.map((r) => {
              const disagrees = r.ci_summary === "PASS" && r.gate_verdict !== "SHIP" && r.gate_verdict !== "SHIP_WITH_WARNINGS";
              return (
                <tr
                  key={r.run_id}
                  tabIndex={0}
                  onClick={() => open(r.run_id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open(r.run_id))}
                  className="cursor-pointer transition-colors hover:bg-sunken/60 focus-visible:bg-sunken/60 focus-visible:outline-none"
                  aria-label={`Inspect ${r.run_id}`}
                >
                  <td className="px-4 py-2.5 sm:px-5">
                    <span className="font-mono text-[12px] text-ink">{r.run_id}</span>
                    {r.release_candidate && <span className="ml-2 font-mono text-[10.5px] text-accent">{r.release_candidate}</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-muted">{r.service_id}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-muted">{r.commit.slice(0, 7)}</td>
                  <td className="tabular px-3 py-2.5 font-mono text-[12px] text-muted">{r.queued_utc.replace("T", " ").replace("Z", "")}</td>
                  <td className="px-3 py-2.5">
                    <span className={cx("font-mono text-[11.5px]", r.ci_summary === "PASS" ? "text-ship" : r.ci_summary ? "text-block" : "text-violet")}>
                      {r.ci_summary ?? "missing"}
                    </span>
                    {disagrees && (
                      <span className="ml-2 rounded-[3px] border border-accent/50 px-1 py-px font-mono text-[10px] text-accent" title="The CI summary says PASS but the attempts do not support it (R5)">
                        disagrees
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 sm:px-5">
                    <VerdictBadge verdict={r.gate_verdict} size="sm" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
