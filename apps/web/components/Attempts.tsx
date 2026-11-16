"use client";

import type { AttemptView, OutcomeView, Timestamp } from "@/lib/types";
import { EvidenceChip } from "./Evidence";
import { cx, fmtUtc, Pill, statusTone } from "./ui";

const NODE: Record<string, string> = {
  PASS: "border border-ship/60 bg-ship/15 text-ship",
  FAIL: "border border-block/60 bg-block/15 text-block",
  ERROR: "border border-accent/60 bg-accent/15 text-accent",
  NO_RESULT: "border border-dashed border-faint bg-surface text-muted",
};

export function AttemptTimeline({ outcome, compact }: { outcome: OutcomeView; compact?: boolean }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <EvidenceChip id={outcome.test_id} />
        <span className="text-[13.5px] text-ink">{outcome.name}</span>
        <Pill mono>{outcome.suite}</Pill>
      </div>
      <ol className="relative space-y-0" aria-label={`Attempts for ${outcome.test_id}`}>
        {outcome.attempts.map((a, i) => (
          <AttemptRow key={a.attempt_id} a={a} last={i === outcome.attempts.length - 1} compact={compact} />
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-9 text-xs text-muted">
        <span className="label-mono text-[10.5px] text-faint">Final · R2</span>
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
      {!last && <span aria-hidden className="absolute left-[13.5px] top-7 h-[calc(100%-1.5rem)] w-px bg-line-strong" />}
      <span
        aria-hidden
        className={cx("z-10 flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium", NODE[status] ?? NODE.NO_RESULT)}
      >
        {a.attempt}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="label-mono text-[10.5px] text-muted">Attempt {a.attempt}</span>
          <Pill tone={statusTone(status)} mono>
            {status}
          </Pill>
          {a.error_class && <span className="font-mono text-xs text-ink">{a.error_class}</span>}
          {a.triage && <TriagePill code={a.triage.code} label={a.triage.label} />}
          {a.category && <Pill mono>{a.category}</Pill>}
        </div>
        {a.message && <p className="mt-1 font-mono text-[11.5px] text-muted">“{a.message}”</p>}
        {status === "NO_RESULT" && (
          <p className="mt-1 text-xs text-muted">Started, never reported a result. Not imputed as pass or fail (R6).</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-faint">
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
    <div className="rounded-[4px] border border-line bg-surface">
      <div className="label-mono border-b border-line bg-sunken/50 px-3 py-1.5 text-[10.5px] text-faint">{label}</div>
      <dl className="grid grid-cols-1 gap-2 p-3 text-sm sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="label-mono text-[10px] text-faint">Raw value</dt>
          <dd className="break-all font-mono text-xs text-ink">{ts?.raw == null ? <em className="text-faint">null</em> : String(ts.raw)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="label-mono text-[10px] text-faint">Format</dt>
          <dd className="font-mono text-xs">
            <Pill tone={ts?.format === "missing" ? "amber" : ts?.format === "naive-assumed-utc" ? "amber" : "neutral"} mono>
              {ts?.format ?? "unknown"}
            </Pill>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="label-mono text-[10px] text-faint">Normalised (UTC)</dt>
          <dd className="break-all font-mono text-xs text-ink">{ts?.utc ?? <em className="text-faint">unknown</em>}</dd>
        </div>
      </dl>
    </div>
  );
}

export function RawVsNormal({ label, raw, normal }: { label: string; raw: string | null | undefined; normal: string | null | undefined }) {
  return (
    <div className="rounded-[4px] border border-line bg-surface">
      <div className="label-mono border-b border-line bg-sunken/50 px-3 py-1.5 text-[10.5px] text-faint">{label}</div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-3">
        <div className="min-w-0">
          <div className="label-mono text-[10px] text-faint">Raw (as sent by source)</div>
          <div className="break-all font-mono text-sm text-ink">{raw == null ? <em className="text-faint">null</em> : `"${raw}"`}</div>
        </div>
        <span aria-hidden className="text-accent">
          →
        </span>
        <div className="min-w-0">
          <div className="label-mono text-[10px] text-faint">Normalised</div>
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
        "rounded-[4px] border p-3",
        flagged ? "border-block/45 bg-block/[0.07]" : "border-line bg-sunken",
      )}
    >
      <figcaption className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-faint">
        <span className="label-mono text-[10.5px]">Untrusted log text</span>
        {level && <Pill mono>{level}</Pill>}
        {flagged && (
          <span className="inline-flex items-center rounded-[3px] border border-block/60 bg-block/15 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-block">
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

const TRIAGE_STYLE: Record<string, string> = {
  PB: "border-block/45 bg-block/10 text-block",
  AB: "border-violet/45 bg-violet/10 text-violet",
  SI: "border-warn/45 bg-warn/10 text-warn",
  TI: "border-accent/45 bg-accent/10 text-accent",
};

/** ReportPortal-style defect type: the short code carries the colour, the label explains it. */
export function TriagePill({ code, label }: { code: string; label: string }) {
  return (
    <span
      title={`Defect type: ${label}`}
      className={cx("inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-px font-mono text-[10.5px] uppercase tracking-[0.06em]", TRIAGE_STYLE[code] ?? TRIAGE_STYLE.TI)}
    >
      <b className="font-semibold">{code}</b>
      <span className="normal-case tracking-normal opacity-90">{label}</span>
    </span>
  );
}
