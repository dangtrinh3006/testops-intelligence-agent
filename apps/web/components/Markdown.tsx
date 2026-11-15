"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isRecordId } from "@/lib/ids";
import { EvidenceChip, linkify } from "./Evidence";

// Raw HTML is never rendered (no rehype-raw); text nodes are scanned for record ids.
const components: Components = {
  p: ({ children }) => <p>{linkify(children)}</p>,
  li: ({ children }) => <li>{linkify(children)}</li>,
  strong: ({ children }) => <strong>{linkify(children)}</strong>,
  em: ({ children }) => <em>{linkify(children)}</em>,
  td: ({ children }) => <td>{linkify(children)}</td>,
  th: ({ children }) => <th>{linkify(children)}</th>,
  h1: ({ children }) => <h3>{linkify(children)}</h3>,
  h2: ({ children }) => <h3>{linkify(children)}</h3>,
  h3: ({ children }) => <h4>{linkify(children)}</h4>,
  h4: ({ children }) => <h4>{linkify(children)}</h4>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
  img: () => null,
  code: ({ children, className }) => {
    const text = String(children ?? "");
    if (!className && isRecordId(text)) return <EvidenceChip id={text.trim()} />;
    return <code className={className}>{children}</code>;
  },
};

export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose-answer text-[0.95rem] leading-relaxed text-ink">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
