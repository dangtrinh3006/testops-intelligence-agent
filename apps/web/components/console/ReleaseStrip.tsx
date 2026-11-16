"use client";

import { useOverview } from "@/lib/hooks";
import { EvidenceChip } from "../Evidence";
import { cx, ErrorBlock, Eyebrow, Pill, Skeleton, VERDICT_ACCENT, VerdictBadge, verdictLabel } from "../ui";
import { errorMessage } from "@/lib/api";

export function ReleaseStrip() {
  const { data, error, loading, reload } = useOverview();

  return (
    <section aria-labelledby="rc-title" className="mb-14">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <Eyebrow>
          <span id="rc-title">Release candidates</span>
        </Eyebrow>
        {data && (
          <span className="font-mono text-[11px] text-faint">
            {data.company.name} · as of <span className="tabular">{data.as_of.replace("T", " ").replace("Z", " UTC")}</span> ·{" "}
            {data.totals.runs} runs · {data.totals.attempts} attempts · {data.totals.findings} data-quality findings
          </span>
        )}
      </div>
      {error && <ErrorBlock message={errorMessage(error)} onRetry={reload} />}
      <div className="grid gap-3 md:grid-cols-3">
        {loading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="rounded-[4px] border border-line bg-surface p-4">
              <Skeleton className="mb-3 h-3 w-1/3" />
              <Skeleton className="mb-4 h-6 w-1/2" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ))}
        {data?.release_candidates.map((rc) => {
          const svc = data.services.find((s) => s.id === rc.service_id);
          return (
            <article
              key={rc.id}
              aria-label={`${svc?.name ?? rc.service_id} ${rc.version}: ${verdictLabel(rc.verdict)}`}
              className={cx("rounded-[4px] border border-t-2 border-line bg-surface transition-colors hover:border-line-strong", VERDICT_ACCENT[rc.verdict])}
            >
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
                <span className="label-mono truncate text-[10.5px] text-faint">{svc?.name ?? rc.service_id}</span>
                {svc && <Pill mono>{svc.tier}</Pill>}
              </div>
              <div className="p-4">
                <div className="font-serif text-[28px] leading-none tracking-[-0.02em] text-ink">{rc.version}</div>
                <div className="mt-4">
                  <VerdictBadge verdict={rc.verdict} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
                  <span className="label-mono text-[10.5px] text-faint">
                    rule <span className="text-ink">{rc.deciding_rule}</span>
                  </span>
                  <span aria-hidden className="text-faint">·</span>
                  <EvidenceChip id={rc.id} />
                  <EvidenceChip id={rc.run_id} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
