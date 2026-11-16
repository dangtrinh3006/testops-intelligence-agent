"use client";

import { useId, type ReactNode } from "react";

// Hover/focus tooltip; the trigger stays keyboard reachable and the text is exposed via aria-describedby.
export function Tooltip({ children, content, align = "start" }: { children: ReactNode; content: ReactNode; align?: "start" | "end" }) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      <span tabIndex={0} aria-describedby={id} className="inline-flex cursor-help rounded-[3px]">
        {children}
      </span>
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none invisible absolute ${align === "end" ? "right-0" : "left-0"} top-full z-20 mt-1.5 w-64 max-w-[80vw] rounded-[4px] border border-line-strong bg-raised p-2.5 text-xs font-normal normal-case leading-snug tracking-normal text-ink opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100`}
      >
        {content}
      </span>
    </span>
  );
}
