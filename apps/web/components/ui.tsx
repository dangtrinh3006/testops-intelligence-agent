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
    <Tag className={cx("min-w-0 rounded-[4px] border border-line bg-surface", className)} {...rest}>
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
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        {eyebrow && <div className="label-mono mb-1 text-faint">{eyebrow}</div>}
        <h2 id={id} className="font-serif text-[1.2rem] leading-snug tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {children && <div className="mt-1 text-[13px] text-muted">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// Thin console-style bar: mono label left, status chips right.
export function PanelBar({ label, children, className }: { label: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-center justify-between gap-2 border-b border-line bg-sunken/50 px-4 py-2 sm:px-5", className)}>
      <span className="label-mono text-faint">{label}</span>
      {children && <span className="flex flex-wrap items-center gap-1.5">{children}</span>}
    </div>
  );
}

export function Eyebrow({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "p" | "span" }) {
  return (
    <Tag className={cx("label-mono flex items-center gap-3 text-accent", className)}>
      <span aria-hidden className="h-px w-8 shrink-0 bg-accent" />
      <span className="min-w-0">{children}</span>
    </Tag>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  id,
  children,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  id?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-6", className)}>
      {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
      <h2 id={id} className="font-serif text-[28px] leading-[1.15] tracking-[-0.02em] text-ink sm:text-[36px]">
        {title}
      </h2>
      {children && <div className="mt-3 max-w-3xl text-[15px] text-muted">{children}</div>}
    </div>
  );
}

export function PageTitle({ title, children, eyebrow }: { title: ReactNode; children?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-7 border-b border-line pb-5">
      {eyebrow && <div className="label-mono mb-2 text-[10.5px] text-accent">{eyebrow}</div>}
      <h1 className="font-serif text-[28px] leading-tight tracking-[-0.02em] text-ink sm:text-[30px]">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

export function Numeral({ n, label, className }: { n: number | string; label?: ReactNode; className?: string }) {
  return (
    <span className={cx("label-mono inline-flex items-center gap-2", className)}>
      <span className="text-accent">{typeof n === "number" ? String(n).padStart(2, "0") : n}</span>
      {label && (
        <>
          <span aria-hidden className="text-faint">
            ·
          </span>
          <span className="text-ink">{label}</span>
        </>
      )}
    </span>
  );
}

const VERDICT_STYLE: Record<Verdict, { cls: string; dot: string; label: string }> = {
  BLOCK: { cls: "border-block/45 bg-block/10 text-block", dot: "bg-block", label: "Block" },
  HOLD_MANUAL_REVIEW: { cls: "border-accent/45 bg-accent/10 text-accent", dot: "bg-accent", label: "Hold · manual review" },
  SHIP_WITH_WARNINGS: { cls: "border-warn/45 bg-warn/10 text-warn", dot: "bg-warn", label: "Ship with warnings" },
  SHIP: { cls: "border-ship/45 bg-ship/10 text-ship", dot: "bg-ship", label: "Ship" },
};

export function verdictLabel(v: Verdict): string {
  return VERDICT_STYLE[v]?.label ?? v;
}

export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict; size?: "sm" | "md" | "lg" }) {
  const s = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.HOLD_MANUAL_REVIEW;
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center gap-2 rounded-[3px] border font-mono font-medium tracking-[0.06em]",
        s.cls,
        size === "sm" && "px-1.5 py-0.5 text-[10.5px]",
        size === "md" && "px-2 py-1 text-[11.5px]",
        size === "lg" && "px-3 py-1.5 text-[13px] sm:text-[15px]",
      )}
    >
      <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", s.dot)} />
      <span className="break-all">{verdict}</span>
    </span>
  );
}

export const VERDICT_ACCENT: Record<Verdict, string> = {
  BLOCK: "border-t-block",
  HOLD_MANUAL_REVIEW: "border-t-accent",
  SHIP_WITH_WARNINGS: "border-t-warn",
  SHIP: "border-t-ship",
};

export const VERDICT_TEXT: Record<Verdict, string> = {
  BLOCK: "text-block",
  HOLD_MANUAL_REVIEW: "text-accent",
  SHIP_WITH_WARNINGS: "text-warn",
  SHIP: "text-ship",
};

const MODE_STYLE: Record<Mode, string> = {
  live: "border-accent/50 bg-accent/10 text-accent",
  replay: "border-violet/45 bg-violet/10 text-violet",
  offline: "border-line-strong bg-sunken text-muted",
};

export function ModeBadge({ mode }: { mode: Mode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10.5px] font-medium tracking-[0.1em]", MODE_STYLE[mode])}>
      {mode === "live" && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
      {mode.toUpperCase()}
    </span>
  );
}

export type Tone = "neutral" | "red" | "amber" | "green" | "blue" | "violet";

const TONE: Record<Tone, string> = {
  neutral: "border-line-strong bg-sunken text-muted",
  red: "border-block/40 bg-block/10 text-block",
  amber: "border-accent/40 bg-accent/10 text-accent",
  green: "border-ship/40 bg-ship/10 text-ship",
  blue: "border-warn/40 bg-warn/10 text-warn",
  violet: "border-violet/40 bg-violet/10 text-violet",
};

export function Pill({ children, tone = "neutral", mono, className }: { children: ReactNode; tone?: Tone; mono?: boolean; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-px text-[11px] leading-[1.15rem]",
        TONE[tone],
        mono ? "font-mono tracking-[0.02em]" : "font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

// Console status chip, e.g. "gate: live · verify".
export function StatusChip({ children, tone = "neutral", dot }: { children: ReactNode; tone?: Tone; dot?: boolean }) {
  return (
    <span className={cx("inline-flex max-w-full items-center gap-1.5 rounded-[3px] border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em]", TONE[tone])}>
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
      <span className="min-w-0 truncate">{children}</span>
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
      className={cx("inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-current border-r-transparent", className)}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("skeleton block rounded-[3px]", className)} />;
}

export function LoadingBlock({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2.5 p-4 sm:p-5">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cx("h-3.5", i % 3 === 0 ? "w-1/3" : i % 2 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function ErrorBlock({ title = "Could not load data", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-4 rounded-[4px] border border-block/40 bg-block/[0.07] p-4 text-sm text-ink">
      <div className="label-mono text-block">{title}</div>
      <p className="mt-1.5 text-muted">{message}</p>
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
    "inline-flex items-center justify-center gap-2 rounded-[3px] border font-mono uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    size === "sm" ? "px-3 py-1.5 text-[11px]" : "px-4 py-2.5 text-[12px]",
    variant === "primary" &&
      "border-accent text-accent hover:border-accent-hover hover:bg-accent/10 hover:text-accent-hover disabled:hover:bg-transparent",
    variant === "secondary" && "border-line-strong text-ink hover:border-faint hover:bg-sunken",
    variant === "ghost" && "border-transparent text-muted hover:bg-sunken hover:text-ink",
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label-mono text-[10.5px] text-faint">{label}</dt>
      <dd className="mt-1 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}

export function StatTile({ label, value, sub, className, valueClass }: { label: string; value: ReactNode; sub?: ReactNode; className?: string; valueClass?: string }) {
  return (
    <div className={cx("rounded-[4px] border border-line bg-surface p-4", className)}>
      <div className="label-mono text-[10.5px] text-faint">{label}</div>
      <div className={cx("tabular mt-2 font-serif text-[30px] leading-none tracking-[-0.02em] text-ink", valueClass)}>{value}</div>
      {sub && <div className="mt-2 text-[12px] text-muted">{sub}</div>}
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
