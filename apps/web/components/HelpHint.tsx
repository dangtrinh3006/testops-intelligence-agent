"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

// Contextual "?" help: one or two sentences in place, with a link to the full docs section.

export function HelpHint({ children, href, label = "What is this?" }: { children: ReactNode; href: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={root} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="grid size-[18px] place-items-center rounded-full border border-line-strong font-mono text-[10.5px] text-faint transition-colors hover:border-accent hover:text-accent"
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="dialog"
          aria-label={label}
          className="absolute left-0 top-6 z-30 w-[min(18rem,80vw)] rounded-[4px] border border-line-strong bg-raised p-3 text-left font-sans text-[12.5px] font-normal normal-case leading-relaxed tracking-normal text-muted shadow-[0_10px_24px_-12px_rgba(0,0,0,0.7)]"
        >
          <span className="block">{children}</span>
          <Link href={href} onClick={() => setOpen(false)} className="mt-2 inline-block font-mono text-[11px] text-accent hover:text-accent-hover">
            Learn more →
          </Link>
        </span>
      )}
    </span>
  );
}
