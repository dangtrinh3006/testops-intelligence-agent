"use client";

import { useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { HistoryCell, HistoryState, TestHistory, Verdict } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { TriagePill } from "../Attempts";
import { useInspector } from "../inspector-context";
import { Card, cx, ErrorBlock, LoadingBlock, StatTile } from "../ui";

// Test x run matrix, oldest run on the left. Cells come from raw attempts, never the CI summary (R2).

const STATE_STYLE: Record<HistoryState, string> = {
  pass: "bg-ship/45",
  retry_pass: "bg-accent",
  retry_pass_infra: "bg-warn/70",
  fail: "bg-block",
  fail_infra: "bg-[repeating-linear-gradient(135deg,var(--warn)_0_2px,transparent_2px_4px)] ring-1 ring-inset ring-warn/70",
  incomplete: "bg-[repeating-linear-gradient(135deg,var(--violet)_0_2px,transparent_2px_4px)] ring-1 ring-inset ring-violet/80",
};

const STATE_LABEL: Record<HistoryState, string> = {
  pass: "Pass",
  retry_pass: "Pass on retry",
  retry_pass_infra: "Pass on retry · infra",
  fail: "Fail",
  fail_infra: "Fail · infra",
  incomplete: "No result",
};

const VERDICT_DOT: Record<Verdict, string> = {
  SHIP: "bg-ship",
  SHIP_WITH_WARNINGS: "bg-warn",
  HOLD_MANUAL_REVIEW: "bg-accent",
  BLOCK: "bg-block",
};

type Hover = { row: number; col: number } | null;

export function HistoryView() {
  const [service, setService] = useState("checkout-web");
  const { data, error, loading, reload } = useApi(`history:${service}`, () => api.testHistory(service, 40));
  return (
    <div className="space-y-6">
      <ServicePicker value={service} options={data?.services ?? ["checkout-web", "payments-api", "inventory-svc", "support-assistant"]} onChange={setService} />
      {loading && <Card><LoadingBlock rows={6} label="Loading test history" /></Card>}
      {!loading && (error || !data) && <ErrorBlock message={errorMessage(error)} onRetry={reload} />}
      {!loading && data && <Matrix h={data} />}
    </div>
  );
}

function ServicePicker({ value, options, onChange }: { value: string; options: string[]; onChange: (s: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Service" className="inline-flex flex-wrap gap-1 rounded-[4px] border border-line bg-surface p-1">
      {options.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={s === value}
          onClick={() => onChange(s)}
          className={cx(
            "rounded-[3px] border px-3 py-1.5 font-mono text-[11.5px] tracking-[0.04em] transition-colors",
            s === value ? "border-accent/60 bg-accent/10 text-accent" : "border-transparent text-muted hover:bg-sunken hover:text-ink",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function Matrix({ h }: { h: TestHistory }) {
  const { open } = useInspector();
  const [hover, setHover] = useState<Hover>(null);
  const [pinned, setPinned] = useState<{ testId: string; col: number } | null>(null);

  const totals = useMemo(() => {
    const t: Record<HistoryState, number> = { pass: 0, retry_pass: 0, retry_pass_infra: 0, fail: 0, fail_infra: 0, incomplete: 0 };
    let cells = 0;
    for (const row of Object.values(h.cells)) for (const c of row) if (c) { t[c.state] += 1; cells += 1; }
    return { ...t, cells };
  }, [h]);

  const focus = hover ? { testId: h.tests[hover.row]?.test_id, col: hover.col } : pinned;
  const focusCell: HistoryCell | null = focus?.testId != null ? h.cells[focus.testId]?.[focus.col] ?? null : null;
  const focusRun = focus ? h.runs[focus.col] : undefined;
  const focusTest = focus ? h.tests.find((t) => t.test_id === focus.testId) : undefined;
  const pct = (n: number) => (totals.cells ? `${((n / totals.cells) * 100).toFixed(1)}%` : "—");

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Runs shown" value={h.runs.length} sub={`${h.tests.length} tests · oldest left`} />
        <StatTile label="First-attempt pass" value={pct(totals.pass)} sub={`${totals.pass} of ${totals.cells} test runs`} />
        <StatTile label="Retry-passes" value={totals.retry_pass + totals.retry_pass_infra} sub={`${totals.retry_pass} test · ${totals.retry_pass_infra} infra (R1)`} />
        <StatTile label="Unknown outcome" value={totals.incomplete} sub="never imputed (R6)" />
      </div>

      <Card aria-labelledby="matrix-title" className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
          <h2 id="matrix-title" className="font-serif text-[1.2rem] tracking-[-0.01em] text-ink">
            {h.service_id} · test × run
          </h2>
          <Legend states={h.states} />
        </div>

        <div className="overflow-x-auto" onMouseLeave={() => setHover(null)}>
          <table className="w-full border-separate border-spacing-0 text-left" aria-label={`Test outcomes for ${h.service_id}, one column per run`}>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-20 min-w-[13rem] bg-surface px-4 py-2 align-bottom">
                  <span className="label-mono text-[10px] text-faint">Gate verdict · run</span>
                </th>
                {h.runs.map((r, col) => (
                  <th key={r.run_id} scope="col" className={cx("px-[1.5px] pb-1 align-bottom", hover?.col === col && "bg-accent/[0.06]")}>
                    <button
                      type="button"
                      onClick={() => open(r.run_id)}
                      onMouseEnter={() => setHover({ row: -1, col })}
                      aria-label={`Run ${r.run_id}: ${r.verdict} (rule ${r.deciding_rule}), CI summary ${r.summary_status ?? "missing"}`}
                      className="group flex w-full min-w-[12px] flex-col items-center gap-1"
                    >
                      <span className={cx("size-[9px] rounded-full ring-1 ring-black/40", VERDICT_DOT[r.verdict])} />
                      {r.summary_status !== "PASS" && r.summary_status !== null ? (
                        <span className="h-[3px] w-[9px] bg-block/70" title="CI summary not PASS" />
                      ) : r.summary_status === null ? (
                        <span className="h-[3px] w-[9px] bg-violet/80" title="CI summary missing" />
                      ) : (
                        <span className="h-[3px] w-[9px] bg-line-strong" />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {h.tests.map((t, row) => (
                <tr key={t.test_id}>
                  <th
                    scope="row"
                    className={cx(
                      "sticky left-0 z-10 max-w-[16rem] border-t border-line bg-surface px-4 py-1 text-left font-normal",
                      hover?.row === row && "bg-sunken",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-ink">{t.test_id}</span>
                      {t.suite === "critical" && <span className="label-mono text-[9px] text-accent">gate</span>}
                    </span>
                    <span className="block truncate text-[11px] text-faint" title={t.name}>
                      {t.name}
                    </span>
                  </th>
                  {(h.cells[t.test_id] ?? []).map((c, col) => {
                    const active = hover && (hover.row === row || hover.col === col);
                    return (
                      <td key={col} className={cx("border-t border-line px-[1.5px] py-1", active && "bg-accent/[0.06]")}>
                        {c ? (
                          <button
                            type="button"
                            onMouseEnter={() => setHover({ row, col })}
                            onFocus={() => setHover({ row, col })}
                            onClick={() => {
                              setPinned({ testId: t.test_id, col });
                              open(c.attempt_id);
                            }}
                            aria-label={`${t.test_id} in ${h.runs[col]?.run_id ?? ""}: ${STATE_LABEL[c.state]}, ${c.attempts} attempt${c.attempts > 1 ? "s" : ""}${c.triage ? `, ${c.triage.label}` : ""}`}
                            className={cx(
                              "block h-[16px] w-full min-w-[12px] rounded-[2px] transition-transform hover:scale-y-125 focus-visible:scale-y-125",
                              STATE_STYLE[c.state],
                              hover?.row === row && hover?.col === col && "outline outline-1 outline-offset-1 outline-ink",
                            )}
                          />
                        ) : (
                          <span aria-label="not run" className="block h-[16px] w-full min-w-[12px] rounded-[2px] bg-sunken" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="min-h-[4.5rem] border-t border-line bg-sunken/40 px-4 py-3 sm:px-5" aria-live="polite">
          {focusRun && focusTest && focusCell ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
              <span className={cx("inline-block h-3 w-3 rounded-[2px]", STATE_STYLE[focusCell.state])} aria-hidden />
              <span className="font-mono text-[12px] text-ink">{focusTest.test_id}</span>
              <span className="text-muted">in</span>
              <span className="font-mono text-[12px] text-ink">{focusRun.run_id}</span>
              <span className="text-ink">{STATE_LABEL[focusCell.state]}</span>
              <span className="font-mono text-[11px] text-faint">
                {focusCell.attempts} attempt{focusCell.attempts > 1 ? "s" : ""} · commit {focusRun.commit.slice(0, 7)} · gate {focusRun.verdict}
              </span>
              {focusCell.error_class && <span className="font-mono text-[11px] text-muted">{focusCell.error_class}</span>}
              {focusCell.triage && <TriagePill code={focusCell.triage.code} label={focusCell.triage.label} />}
              <span className="w-full text-[12px] text-faint">{h.states[focusCell.state]} · click to open the attempt in the evidence inspector</span>
            </div>
          ) : focusRun ? (
            <p className="text-[13px] text-muted">
              <span className="font-mono text-ink">{focusRun.run_id}</span> · gate {focusRun.verdict} (rule {focusRun.deciding_rule}) · CI summary{" "}
              {focusRun.summary_status ?? "missing"} · click the dot to open the run
            </p>
          ) : (
            <p className="text-[13px] text-faint">Hover a cell for the attempt history; click to open its evidence. Column dots are gate verdicts per run.</p>
          )}
        </div>
      </Card>
    </>
  );
}

function Legend({ states }: { states: Record<HistoryState, string> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="Legend">
      {(Object.keys(STATE_LABEL) as HistoryState[]).map((s) => (
        <li key={s} className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted" title={states[s]}>
          <span aria-hidden className={cx("inline-block h-[11px] w-[11px] rounded-[2px]", STATE_STYLE[s])} />
          {STATE_LABEL[s]}
        </li>
      ))}
      <li className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted">
        <span aria-hidden className="inline-block size-[9px] rounded-full bg-accent" /> gate verdict
      </li>
    </ul>
  );
}
