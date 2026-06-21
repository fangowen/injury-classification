"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  text: string;
  streaming: boolean;
  onCitationClick?: (pmid: string) => void;
}

function splitReport(md: string): { takehome: string; full: string } {
  const lower = md.toLowerCase();
  const i = lower.indexOf("## full report");
  if (i < 0) return { takehome: md, full: "" };
  return { takehome: md.slice(0, i).trim(), full: md.slice(i).trim() };
}

function stripTakehomeHeading(md: string): string {
  return md.replace(/^##\s*take-?home\s*\n?/i, "").trim();
}

function renderWithCitations(text: string, onClick?: (pmid: string) => void) {
  const parts: (string | { pmid: string })[] = [];
  const regex = /\[PMID:\s*(\d+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ pmid: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((part, i) =>
    typeof part === "string" ? (
      <span key={i}>{part}</span>
    ) : (
      <button
        key={i}
        type="button"
        onClick={() => onClick?.(part.pmid)}
        className="pmid-cite"
        title="Jump to paper"
      >
        PMID {part.pmid}
      </button>
    ),
  );
}

function Markdown({ text, onCitationClick }: { text: string; onCitationClick?: (p: string) => void }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p>{renderChildren(children, onCitationClick)}</p>,
        li: ({ children }) => <li>{renderChildren(children, onCitationClick)}</li>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function renderChildren(children: React.ReactNode, onClick?: (p: string) => void): React.ReactNode {
  if (typeof children === "string") return renderWithCitations(children, onClick);
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === "string" ? (
        <span key={i}>{renderWithCitations(c, onClick)}</span>
      ) : (
        <span key={i}>{c}</span>
      ),
    );
  }
  return children;
}

export default function ReportStream({ text, streaming, onCitationClick }: Props) {
  const { takehome, full } = useMemo(() => splitReport(text), [text]);

  if (!text) {
    return (
      <div className="rounded-lg border border-dashed border-ink-200 bg-white p-6 text-center text-sm text-ink-400">
        The report will stream here once the agent finishes searching.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Take-home
          </h2>
          {streaming && !full && (
            <span className="text-xs text-ink-400">streaming…</span>
          )}
        </div>
        <div className="markdown text-ink-900">
          <Markdown text={stripTakehomeHeading(takehome)} onCitationClick={onCitationClick} />
        </div>
      </div>

      {(full || streaming) && (
        <details className="group rounded-lg border border-ink-200 bg-white">
          <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-ink-700 hover:bg-ink-50">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90">▸</span>
            Show full evidence report
            {streaming && full && <span className="ml-2 text-xs text-ink-400">streaming…</span>}
          </summary>
          <div className="markdown border-t border-ink-100 px-5 py-4 text-ink-800">
            <Markdown text={full} onCitationClick={onCitationClick} />
          </div>
        </details>
      )}
    </div>
  );
}
