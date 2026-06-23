"use client";

import { useMemo } from "react";

interface Props {
  text: string;
  streaming: boolean;
  onCitationClick?: (index: number) => void;
}

interface Sections {
  synthesis: string;
  bottomLine: string;
  nextSteps: string;
}

function splitSections(md: string): Sections {
  const lower = md.toLowerCase();
  const synthesisStart = lower.indexOf("## synthesis");
  const bottomStart = lower.indexOf("## bottom line");
  const stepsStart = lower.indexOf("## next steps");

  const slice = (from: number, to: number) =>
    from < 0 ? "" : md.slice(from, to < 0 ? md.length : to).trim();

  const stripHeading = (s: string) => s.replace(/^##\s*[^\n]*\n?/i, "").trim();

  return {
    synthesis: stripHeading(slice(synthesisStart, bottomStart >= 0 ? bottomStart : stepsStart)),
    bottomLine: stripHeading(slice(bottomStart, stepsStart)),
    nextSteps: stripHeading(slice(stepsStart, -1)),
  };
}

// Render inline markdown: **bold**, *italic*, and [N] citations.
function renderInline(text: string, onCitationClick?: (index: number) => void): React.ReactNode[] {
  // First split by citation patterns: [1], [1,2], [1, 2, 3]
  const nodes: React.ReactNode[] = [];
  const citationRe = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let pos = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = citationRe.exec(text)) !== null) {
    if (m.index > pos) {
      nodes.push(...renderMarkup(text.slice(pos, m.index), key++));
    }
    const indices = m[1].split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    for (const idx of indices) {
      nodes.push(
        <button
          key={`c-${key++}`}
          type="button"
          onClick={() => onCitationClick?.(idx)}
          className="pmid-sup"
          title={`Jump to source ${idx}`}
        >
          {idx}
        </button>,
      );
    }
    pos = m.index + m[0].length;
  }
  if (pos < text.length) {
    nodes.push(...renderMarkup(text.slice(pos), key++));
  }
  return nodes;
}

// Tiny inline markup: **bold** and *italic*. No links beyond what citations cover.
function renderMarkup(text: string, baseKey: number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let pos = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > pos) out.push(text.slice(pos, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      out.push(<strong key={`b-${baseKey}-${k++}`}>{token.slice(2, -2)}</strong>);
    } else {
      out.push(<em key={`i-${baseKey}-${k++}`}>{token.slice(1, -1)}</em>);
    }
    pos = m.index + m[0].length;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

function paragraphs(md: string): string[] {
  return md
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

interface Step {
  title: string;
  body: string;
}

function parseSteps(md: string): Step[] {
  // Match lines starting with "1." "2." etc.; capture the rest of the item until the next "N." or end.
  const items: Step[] = [];
  const lines = md.split("\n");
  let current: string[] = [];
  const flush = () => {
    if (!current.length) return;
    const joined = current.join(" ").trim();
    // strip leading "N."
    const stripped = joined.replace(/^\d+\.\s*/, "");
    // Title vs body: take "**Title.**" or text up to first period as title.
    const boldMatch = stripped.match(/^\*\*([^*]+?)\*\*\s*(.*)$/);
    if (boldMatch) {
      items.push({ title: boldMatch[1].trim().replace(/\.$/, ""), body: boldMatch[2].trim() });
    } else {
      const firstDot = stripped.indexOf(".");
      if (firstDot > 0 && firstDot < 80) {
        items.push({ title: stripped.slice(0, firstDot).trim(), body: stripped.slice(firstDot + 1).trim() });
      } else {
        items.push({ title: "", body: stripped });
      }
    }
    current = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\d+\.\s/.test(line)) {
      flush();
      current.push(line);
    } else if (line) {
      current.push(line);
    }
  }
  flush();
  return items;
}

function BlinkingCursor() {
  return <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse-soft bg-accent align-middle" />;
}

export default function ReportStream({ text, streaming, onCitationClick }: Props) {
  const { synthesis, bottomLine, nextSteps } = useMemo(() => splitSections(text), [text]);

  if (!text) {
    if (!streaming) return null;
    return (
      <div className="space-y-3 pt-2">
        <div className="h-4 w-3/4 animate-shimmer rounded bg-gradient-to-r from-surface via-surface-2 to-surface bg-[length:200%_100%]" />
        <div className="h-4 w-5/6 animate-shimmer rounded bg-gradient-to-r from-surface via-surface-2 to-surface bg-[length:200%_100%]" />
        <div className="h-4 w-2/3 animate-shimmer rounded bg-gradient-to-r from-surface via-surface-2 to-surface bg-[length:200%_100%]" />
      </div>
    );
  }

  const synParas = paragraphs(synthesis);
  const steps = parseSteps(nextSteps);
  const showCursor = streaming;

  // Fallback: if we got tokens but couldn't find any of the expected headings,
  // render the raw markdown (minus any unknown ## headings) as a single block.
  // Stops the page from looking blank during the warm-up tokens, and survives
  // any prompt drift that doesn't use the expected section names.
  const matchedAny = !!(synthesis || bottomLine || nextSteps);
  if (!matchedAny) {
    const cleaned = text.replace(/^##\s+[^\n]*\n?/gm, "").trim();
    const paras = paragraphs(cleaned);
    return (
      <article className="prose-serif animate-fade-in">
        {paras.map((p, i) => (
          <p key={i}>
            {renderInline(p, onCitationClick)}
            {showCursor && i === paras.length - 1 && <BlinkingCursor />}
          </p>
        ))}
      </article>
    );
  }

  return (
    <article className="space-y-8 animate-fade-in">
      {synParas.length > 0 && (
        <div className="prose-serif">
          {synParas.map((p, i) => (
            <p key={i}>
              {renderInline(p, onCitationClick)}
              {showCursor && !bottomLine && i === synParas.length - 1 && <BlinkingCursor />}
            </p>
          ))}
        </div>
      )}

      {bottomLine && (
        <div className="rounded-2xl border border-border bg-surface/60 px-6 py-5 md:px-7 md:py-6">
          <div className="meta mb-2 uppercase tracking-[0.18em]">Bottom line</div>
          <div className="prose-serif text-[17px] leading-[1.65]">
            {paragraphs(bottomLine).map((p, i) => (
              <p key={i} className="!my-0">
                {renderInline(p, onCitationClick)}
                {showCursor && !nextSteps && i === paragraphs(bottomLine).length - 1 && <BlinkingCursor />}
              </p>
            ))}
          </div>
        </div>
      )}

      {steps.length > 0 && (
        <ol className="divide-y divide-border border-t border-border">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-5 py-5">
              <span className="meta mt-1 w-6 shrink-0 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex-1">
                {s.title && (
                  <span className="font-semibold text-fg">{renderInline(s.title)} </span>
                )}
                <span className="text-fg/80">{renderInline(s.body, onCitationClick)}</span>
                {showCursor && i === steps.length - 1 && <BlinkingCursor />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
