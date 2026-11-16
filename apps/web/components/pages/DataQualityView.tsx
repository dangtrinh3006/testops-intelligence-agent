"use client";

import { api, errorMessage } from "@/lib/api";
import type { Finding } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { isRecordId } from "@/lib/ids";
import { EvidenceChip, LinkifiedText } from "../Evidence";
import { Card, CardHeader, ErrorBlock, LoadingBlock, Pill, severityTone } from "../ui";

const KIND_NOTE: Record<string, string> = {
  DUPLICATE_EVENT: "Same event id ingested more than once. Counted once; every copy kept in the raw log.",
  INCOMPLETE_ATTEMPT: "An attempt started and never reported. Outcome is unknown, not pass and not fail.",
  MISSING_FINISHED_AT: "Result without an end time. Duration left unknown, never imputed.",
  MISSING_CI_SUMMARY: "Run without a CI summary event. The gate cannot cross-check it.",
  STATUS_VOCABULARY: "Pipelines use different status words. Normalised to PASS/FAIL; the raw value is kept.",
  NAIVE_TIMESTAMP: "Timestamps without a UTC offset. Treated as UTC per the source contract (an assumption).",
  MIXED_TIMESTAMP_FORMATS: "Several timestamp encodings in one dataset. All normalised to UTC; raw values kept.",
};

const SEV_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export function DataQualityView() {
  const { data, error, loading, reload } = useApi("data-quality", () => api.dataQuality());
  if (loading) return <Card><LoadingBlock rows={6} label="Loading data-quality report" /></Card>;
  if (error || !data) return <ErrorBlock message={errorMessage(error)} onRetry={reload} />;

  const groups = new Map<string, Finding[]>();
  for (const f of data.findings) groups.set(f.kind, [...(groups.get(f.kind) ?? []), f]);
  const ordered = [...groups.entries()].sort(
    (a, b) => Math.min(...a[1].map((f) => SEV_ORDER[f.severity] ?? 3)) - Math.min(...b[1].map((f) => SEV_ORDER[f.severity] ?? 3)),
  );
  const dupes = data.raw_events - data.unique_events;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="grid grid-cols-3 gap-3 lg:col-span-7">
          <div className="rounded-[4px] border border-line bg-surface p-3">
            <div className="label-mono text-[10.5px] text-faint">Raw events</div>
            <div className="tabular mt-2 font-serif text-[30px] leading-none tracking-[-0.02em] text-ink">{data.raw_events.toLocaleString("en-US")}</div>
            <div className="text-[11px] text-muted">as ingested</div>
          </div>
          <div className="rounded-[4px] border border-line bg-surface p-3">
            <div className="label-mono text-[10.5px] text-faint">Unique events</div>
            <div className="tabular mt-2 font-serif text-[30px] leading-none tracking-[-0.02em] text-ink">{data.unique_events.toLocaleString("en-US")}</div>
            <div className="text-[11px] text-muted">used for analysis</div>
          </div>
          <div className="rounded-[4px] border border-line bg-surface p-3">
            <div className="label-mono text-[10.5px] text-faint">Findings</div>
            <div className="tabular mt-2 font-serif text-[30px] leading-none tracking-[-0.02em] text-ink">{data.findings.length}</div>
            <div className="text-[11px] text-muted">{dupes} duplicate{dupes === 1 ? "" : "s"} collapsed</div>
          </div>
        </div>
        <Card className="lg:col-span-5" aria-labelledby="sot-title">
          <CardHeader id="sot-title" title="Source-of-truth precedence" eyebrow="When sources disagree, higher wins (R5)" />
          <ol className="space-y-2 p-4 sm:px-5">
            {data.source_of_truth.map((s, i) => (
              <li key={s} className="flex items-start gap-3 text-sm">
                <span className="label-mono flex size-6 shrink-0 items-center justify-center text-accent">{String(i + 1).padStart(2, "0")}</span>
                <span className="pt-0.5 text-ink">{s}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {ordered.map(([kind, fs]) => (
        <Card key={kind} aria-labelledby={`k-${kind}`}>
          <CardHeader
            id={`k-${kind}`}
            title={<span className="font-mono">{kind}</span>}
            actions={<span className="text-xs text-muted">{fs.length} finding{fs.length === 1 ? "" : "s"}</span>}
          >
            {KIND_NOTE[kind]}
          </CardHeader>
          <ul className="divide-y divide-line">
            {fs.map((f) => (
              <li key={f.id} className="grid gap-2 px-4 py-3.5 transition-colors hover:bg-sunken/40 sm:grid-cols-[9rem_1fr] sm:px-5">
                <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-start">
                  <EvidenceChip id={f.id} />
                  <Pill tone={severityTone(f.severity)}>{f.severity}</Pill>
                  <span className="tabular text-[11px] text-faint">count {f.count.toLocaleString("en-US")}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    <LinkifiedText text={f.detail} />
                  </p>
                  {f.record_ids.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {f.record_ids.map((id) =>
                        isRecordId(id) ? (
                          <EvidenceChip key={id} id={id} />
                        ) : (
                          <span key={id} className="rounded-[3px] border border-line bg-sunken px-1.5 py-px font-mono text-[11px] text-muted" title="Not addressable by the record API">
                            {id}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
