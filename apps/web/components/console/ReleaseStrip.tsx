"use client";

import { useOverview } from "@/lib/hooks";
import { EvidenceChip } from "../Evidence";
import { cx, ErrorBlock, Pill, Skeleton, VERDICT_ACCENT, VerdictBadge, verdictLabel } from "../ui";
import { errorMessage } from "@/lib/api";

export function ReleaseStrip() {
  const { data, error, loading, reload } = useOverview();

  return (
    <section aria-labelledby="rc-title" className="mb-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rc-title" className="text-sm font-semibold text-ink">
          Release candidates
        </h2>
        {data && (
          <span className="text-xs text-faint">
            {data.company.name} · as of <span className="tabular">{data.as_of.replace("T", " ").replace("Z", " UTC")}</span> ·{" "}
            {data.totals.runs} runs, {data.totals.attempts} attempts, {data.totals.findings} data-quality findings
          </span>
        )}
      </div>
      {error && <ErrorBlock message={errorMessage(error)} onRetry={reload} />}
      <div className="grid gap-3 md:grid-cols-3">
        {loading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-line bg-surface p-4">
              <Skeleton className="mb-3 h-4 w-1/2" />
              <Skeleton className="h-7 w-2/3" />
            </div>
          ))}
        {data?.release_candidates.map((rc) => {
          const svc = data.services.find((s) => s.id === rc.service_id);
          return (
            <article
              key={rc.id}
              aria-label={`${svc?.name ?? rc.service_id} ${rc.version}: ${verdictLabel(rc.verdict)}`}
              className={cx("rounded-xl border border-t-4 border-line bg-surface p-4", VERDICT_ACCENT[rc.verdict])}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-muted">{svc?.name ?? rc.service_id}</div>
                  <div className="font-mono text-base font-semibold text-ink">{rc.version}</div>
                </div>
                {svc && <Pill mono>{svc.tier}</Pill>}
              </div>
              <div className="mt-3">
                <VerdictBadge verdict={rc.verdict} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span>
                  deciding rule <span className="font-mono font-semibold text-ink">{rc.deciding_rule}</span>
                </span>
                <span aria-hidden className="text-faint">·</span>
                <EvidenceChip id={rc.id} />
                <EvidenceChip id={rc.run_id} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
