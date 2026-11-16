import Link from "next/link";
import { CHANGELOG, type ChangeTag } from "@/lib/changelog";
import { cx } from "../ui";

const TAG_STYLE: Record<ChangeTag, string> = {
  New: "border-accent/50 bg-accent/10 text-accent",
  Improved: "border-warn/50 bg-warn/10 text-warn",
  Fixed: "border-ship/50 bg-ship/10 text-ship",
};

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export function ChangelogView() {
  return (
    <ol className="space-y-12" aria-label="Releases">
      {CHANGELOG.map((r) => (
        <li key={r.date} className="grid gap-4 md:grid-cols-[11rem_minmax(0,1fr)]">
          <div className="md:sticky md:top-20 md:self-start">
            <time dateTime={r.date} className="font-mono text-[12px] text-muted">
              {fmtDate(r.date)}
            </time>
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-[1.5rem] leading-tight tracking-[-0.01em] text-ink">{r.title}</h2>
            <ul className="mt-4 divide-y divide-line rounded-[4px] border border-line bg-surface">
              {r.items.map((it) => (
                <li key={it.title} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx("rounded-[3px] border px-1.5 py-px font-mono text-[10.5px] uppercase tracking-[0.06em]", TAG_STYLE[it.tag])}>
                      {it.tag}
                    </span>
                    <h3 className="text-[14.5px] font-medium text-ink">
                      {it.href ? (
                        <Link href={it.href} className="hover:text-accent">
                          {it.title}
                        </Link>
                      ) : (
                        it.title
                      )}
                    </h3>
                    {it.refs && (
                      <span className="ml-auto font-mono text-[10.5px] text-faint" title="Git commits">
                        {it.refs.join(" · ")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{it.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ol>
  );
}
