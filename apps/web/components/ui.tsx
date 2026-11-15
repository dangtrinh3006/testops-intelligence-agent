import type { ReactNode } from "react";
import type { Mode, Verdict } from "@/lib/types";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
} & Record<`aria-${string}`, string | undefined>) {
  return (
    <Tag className={cx("rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(15,23,41,0.04)]", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  eyebrow,
  actions,
  id,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  id?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] font-medium uppercase tracking-wider text-faint">{eyebrow}</div>}
        <h2 id={id} className="text-sm font-semibold text-ink">
          {title}
        </h2>
        {children && <div className="mt-0.5 text-xs text-muted">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageTitle({ title, children, eyebrow }: { title: string; children?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6">
      {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wider text-faint">{eyebrow}</div>}
      <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-sm text-muted">{children}</div>}
    </div>
  );
}

const VERDICT_STYLE: Record<Verdict, { cls: string; dot: string; label: string }> = {
  BLOCK: {
    cls: "bg-red-50 text-red-800 ring-red-600/25 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-400/30",
    dot: "bg-red-600 dark:bg-red-400",
    label: "Block",
  },
  HOLD_MANUAL_REVIEW: {
    cls: "bg-amber-50 text-amber-900 ring-amber-600/30 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30",
    dot: "bg-amber-500 dark:bg-amber-400",
    label: "Hold · manual review",
  },
  SHIP_WITH_WARNINGS: {
    cls: "bg-sky-50 text-sky-900 ring-sky-600/25 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-400/30",
    dot: "bg-sky-600 dark:bg-sky-400",
    label: "Ship with warnings",
  },
  SHIP: {
    cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/25 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/30",
    dot: "bg-emerald-600 dark:bg-emerald-400",
    label: "Ship",
  },
};

export function verdictLabel(v: Verdict): string {
  return VERDICT_STYLE[v]?.label ?? v;
}

export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict; size?: "sm" | "md" | "lg" }) {
  const s = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.HOLD_MANUAL_REVIEW;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md font-mono font-semibold ring-1 ring-inset",
        s.cls,
        size === "sm" && "px-1.5 py-0.5 text-[11px]",
        size === "md" && "px-2 py-1 text-xs",
        size === "lg" && "px-3 py-1.5 text-sm sm:text-base",
      )}
    >
      <span aria-hidden className={cx("size-2 shrink-0 rounded-full", s.dot)} />
      <span className="break-all">{verdict}</span>
    </span>
  );
}

export const VERDICT_ACCENT: Record<Verdict, string> = {
  BLOCK: "border-t-red-500",
  HOLD_MANUAL_REVIEW: "border-t-amber-500",
  SHIP_WITH_WARNINGS: "border-t-sky-500",
  SHIP: "border-t-emerald-500",
};

const MODE_STYLE: Record<Mode, string> = {
  live: "bg-violet-600 text-white dark:bg-violet-500",
  replay: "bg-indigo-100 text-indigo-900 ring-1 ring-inset ring-indigo-600/30 dark:bg-indigo-500/20 dark:text-indigo-100 dark:ring-indigo-400/40",
  offline: "bg-zinc-200 text-zinc-800 ring-1 ring-inset ring-zinc-500/30 dark:bg-zinc-700 dark:text-zinc-100",
};

export function ModeBadge({ mode }: { mode: Mode }) {
  return (
    <span className={cx("inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider", MODE_STYLE[mode])}>
      {mode.toUpperCase()}
    </span>
  );
}

type Tone = "neutral" | "red" | "amber" | "green" | "blue" | "violet";

const TONE: Record<Tone, string> = {
  neutral: "bg-sunken text-muted ring-line-strong",
  red: "bg-red-50 text-red-800 ring-red-600/20 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-400/30",
  amber: "bg-amber-50 text-amber-900 ring-amber-600/25 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/30",
  blue: "bg-sky-50 text-sky-900 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-400/30",
  violet: "bg-violet-50 text-violet-900 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-400/30",
};

export function Pill({ children, tone = "neutral", mono, className }: { children: ReactNode; tone?: Tone; mono?: boolean; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        TONE[tone],
        mono && "font-mono",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string | null | undefined): Tone {
  switch ((status ?? "").toUpperCase()) {
    case "PASS":
      return "green";
    case "FAIL":
      return "red";
    case "ERROR":
      return "amber";
    case "INCOMPLETE":
    case "NO_RESULT":
    case "":
      return "neutral";
    default:
      return "neutral";
  }
}

export function severityTone(sev: string): Tone {
  if (sev === "critical") return "red";
  if (sev === "warning") return "amber";
  return "blue";
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-sunken", className)} />;
}

export function LoadingBlock({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2 p-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cx("h-4", i % 2 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function ErrorBlock({ title = "Could not load data", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
      <div className="font-semibold">{title}</div>
      <p className="mt-1">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={cx(buttonClass("secondary"), "mt-3")}>
          Retry
        </button>
      )}
    </div>
  );
}

export function buttonClass(variant: "primary" | "secondary" | "ghost" = "secondary", size: "sm" | "md" = "sm"): string {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm",
    variant === "primary" && "bg-ink text-canvas hover:opacity-90",
    variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-sunken",
    variant === "ghost" && "text-muted hover:bg-sunken hover:text-ink",
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-faint">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[0.85em]", className)}>{children}</span>;
}

export function fmtUtc(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.replace("T", " ").replace(/Z$/, " UTC");
}
