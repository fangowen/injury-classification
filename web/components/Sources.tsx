"use client";

import type { FinalSource, RetrievedChunk } from "@/lib/types";

interface Props {
  sources: FinalSource[];
  fallback: RetrievedChunk[]; // shown while waiting for final_sources
  highlightedIndex?: number | null;
  loading?: boolean;
}

function ScoreBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="mt-4 flex items-center gap-3">
      <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-border/60">
        <div
          className="h-full origin-left rounded-full bg-accent/85 animate-bar-fill"
          style={{ transform: `scaleX(${pct})` }}
        />
      </div>
      <span className="meta tabular-nums">{value.toFixed(2)}</span>
    </div>
  );
}

function metaLine(s: FinalSource): string {
  const parts: string[] = [];
  if (s.author_line) parts.push(s.author_line);
  if (s.study_design) parts.push(s.study_design);
  if (s.year) parts.push(s.year);
  return parts.join(" · ");
}

function stripPrefix(text: string): string {
  return text.replace(/^\[[^\]]+\]\s*from\s*"[^"]*"\s*\([^)]+\):\s*/i, "")
             .replace(/^"[^"]*"\s*\([^)]+\):\s*/i, "")
             .replace(/^\[[^\]]+\]\s*/i, "");
}

export default function Sources({ sources, fallback, highlightedIndex, loading }: Props) {
  // Use final_sources once available; otherwise show a lighter preview from fallback.
  const useFinal = sources.length > 0;
  const list: FinalSource[] = useFinal
    ? sources
    : fallback.slice(0, 6).map((r, i) => ({
        index: i + 1,
        pmid: r.pmid,
        title: r.title ?? "",
        year: r.year,
        study_design: r.study_design,
        population_score: r.population_score,
        score: r.score,
        text: r.text,
        authors: r.authors ?? [],
        author_line: (r.authors ?? [])[0]?.split(",")[0] ?? "",
        diagnosis: r.diagnosis,
      }));

  if (loading && list.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-sans text-base font-semibold text-fg">Sources</h2>
          <span className="meta">retrieving…</span>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-shimmer rounded-xl border border-border bg-gradient-to-r from-surface via-surface-2 to-surface bg-[length:200%_100%]" />
        ))}
      </div>
    );
  }

  if (list.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-sans text-base font-semibold text-fg">Sources</h2>
        <span className="meta">ranked by relevance</span>
      </div>

      <div className="space-y-4">
        {list.map((s) => {
          const isHi = highlightedIndex === s.index;
          const scoreValue =
            s.population_score != null
              ? s.population_score / 5
              : Math.max(0, Math.min(1, s.score ?? 0));
          return (
            <a
              key={s.index}
              id={`source-${s.index}`}
              href={s.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/` : undefined}
              target="_blank"
              rel="noreferrer"
              className={`source-row block rounded-2xl border border-border bg-surface px-5 py-5 transition hover:border-accent/40 hover:bg-surface/80 md:px-6 ${
                isHi ? "flash border-accent" : ""
              }`}
            >
              <div className="flex items-start gap-4">
                <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-tint font-mono text-xs text-accent">
                  {s.index}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-lg font-semibold leading-snug text-fg md:text-xl">
                    {s.title}
                  </h3>
                  {metaLine(s) && <div className="meta mt-1.5">{metaLine(s)}</div>}
                  {s.text && (
                    <p className="mt-3 text-[15px] leading-relaxed text-fg/80">
                      {stripPrefix(s.text).slice(0, 220)}
                      {stripPrefix(s.text).length > 220 ? "…" : ""}
                    </p>
                  )}
                  <ScoreBar value={scoreValue} />
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
