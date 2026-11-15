"use client";

import type { AttemptView, OutcomeView, Timestamp } from "@/lib/types";
import { EvidenceChip } from "./Evidence";
import { cx, fmtUtc, Pill, statusTone } from "./ui";

const NODE: Record<string, string> = {
  PASS: "bg-emerald-600 text-white dark:bg-emerald-500",
  FAIL: "bg-red-600 text-white dark:bg-red-500",
  ERROR: "bg-orange-500 text-white dark:bg-orange-500",
  NO_RESULT: "border-2 border-dashed border-line-strong bg-surface text-muted",
};

export function AttemptTimeline({ outcome, compact }: { outcome: OutcomeView; compact?: boolean }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <EvidenceChip id={outcome.test_id} />
        <span className="text-sm text-ink">{outcome.name}</span>
        <Pill mono>{outcome.suite}</Pill>
      </div>
      <ol className="relative space-y-0" aria-label={`Attempts for ${outcome.test_id}`}>
        {outcome.attempts.map((a, i) => (
          <AttemptRow key={a.attempt_id} a={a} last={i === outcome.attempts.length - 1} compact={compact} />
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-9 text-xs text-muted">
        <span>Final (rule R2):</span>
        <Pill tone={statusTone(outcome.final_status)} mono>
          {outcome.final_status}
        </Pill>
        <span className="font-mono text-faint">{outcome.resolution.replaceAll("_", " ")}</span>
      </div>
    </div>
  );
}

function AttemptRow({ a, last, compact }: { a: AttemptView; last: boolean; compact?: boolean }) {
  const status = a.status || "NO_RESULT";
  return (
    <li className="relative flex gap-3 pb-3">
      {!last && <span aria-hidden className="absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-px bg-line-strong" />}
      <span
        aria-hidden
        className={cx("z-10 flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold", NODE[status] ?? NODE.NO_RESULT)}
      >
        {a.attempt}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-ink">Attempt {a.attempt}</span>
          <Pill tone={statusTone(status)} mono>
            {status}
          </Pill>
          {a.error_class && <span className="font-mono text-xs text-ink">{a.error_class}</span>}
          {a.category && <Pill mono>{a.category}</Pill>}
        </div>
        {a.message && <p className="mt-1 text-xs text-muted">“{a.message}”</p>}
        {status === "NO_RESULT" && (
          <p className="mt-1 text-xs text-muted">Started, never reported a result. Not imputed as pass or fail (R6).</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
          <span className="tabular">started {fmtUtc(a.started_utc)}</span>
          <span className="tabular">finished {a.finished_utc ? fmtUtc(a.finished_utc) : "—"}</span>
          {a.duration_s != null && <span className="tabular">{a.duration_s}s</span>}
          {!compact && <EvidenceChip id={a.attempt_id} />}
        </div>
      </div>
    </li>
  );
}

export function TimestampView({ label, ts }: { label: string; ts: Timestamp | null | undefined }) {
  return (
    <div className="rounded-lg border border-line">
      <div className="border-b border-line px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">{label}</div>
      <dl className="grid grid-cols-1 gap-2 p-3 text-sm sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-[11px] text-faint">Raw value</dt>
          <dd className="break-all font-mono text-xs text-ink">{ts?.raw == null ? <em className="text-faint">null</em> : String(ts.raw)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-faint">Format</dt>
          <dd className="font-mono text-xs">
            <Pill tone={ts?.format === "missing" ? "amber" : ts?.format === "naive-assumed-utc" ? "amber" : "neutral"} mono>
              {ts?.format ?? "unknown"}
            </Pill>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-faint">Normalised (UTC)</dt>
          <dd className="break-all font-mono text-xs text-ink">{ts?.utc ?? <em className="text-faint">unknown</em>}</dd>
        </div>
      </dl>
    </div>
  );
}

export function RawVsNormal({ label, raw, normal }: { label: string; raw: string | null | undefined; normal: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-line">
      <div className="border-b border-line px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">{label}</div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-3">
        <div className="min-w-0">
          <div className="text-[11px] text-faint">Raw (as sent by source)</div>
          <div className="break-all font-mono text-sm text-ink">{raw == null ? <em className="text-faint">null</em> : `"${raw}"`}</div>
        </div>
        <span aria-hidden className="text-faint">
          →
        </span>
        <div className="min-w-0">
          <div className="text-[11px] text-faint">Normalised</div>
          <div>
            <Pill tone={statusTone(normal)} mono>
              {normal ?? "NO_RESULT"}
            </Pill>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UntrustedLog({
  text,
  flagged,
  level,
  eventId,
}: {
  text: string;
  flagged: boolean;
  level?: string;
  eventId?: string;
}) {
  return (
    <figure
      className={cx(
        "rounded-lg border p-3",
        flagged ? "border-red-300 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/10" : "border-line bg-sunken",
      )}
    >
      <figcaption className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-faint">
        <span className="font-medium uppercase tracking-wider">Untrusted log text</span>
        {level && <Pill mono>{level}</Pill>}
        {flagged && (
          <span className="inline-flex items-center rounded bg-red-600 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-white">
            possible prompt injection — ignored
          </span>
        )}
        {eventId && <EvidenceChip id={eventId} />}
      </figcaption>
      <blockquote className="whitespace-pre-wrap break-words border-l-2 border-line-strong pl-3 font-mono text-xs text-ink">
        {text}
      </blockquote>
    </figure>
  );
}
