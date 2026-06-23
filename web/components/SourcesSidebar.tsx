"use client";

import type { FinalSource, RetrievedChunk } from "@/lib/types";

interface Props {
  sources: FinalSource[];
  fallback: RetrievedChunk[];
  highlightedIndex?: number | null;
  loading?: boolean;
  onItemClick?: (index: number) => void;
}

function shortMeta(s: { study_design?: string | null; year?: string | null }): string {
  const parts: string[] = [];
  if (s.study_design) parts.push(s.study_design);
  if (s.year) parts.push(s.year);
  return parts.join(" · ");
}

export default function SourcesSidebar({
  sources,
  fallback,
  highlightedIndex,
  loading,
  onItemClick,
}: Props) {
  const list = sources.length > 0
    ? sources
    : fallback.slice(0, 8).map((r, i) => ({
        index: i + 1,
        pmid: r.pmid,
        title: r.title ?? "",
        year: r.year ?? null,
        study_design: r.study_design ?? null,
        population_score: r.population_score ?? null,
      }));

  if (loading && list.length === 0) {
    return (
      <div className="space-y-3">
        <div className="meta uppercase tracking-[0.18em]">Sources</div>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 animate-shimmer rounded-lg border border-border bg-gradient-to-r from-surface via-surface-2 to-surface bg-[length:200%_100%]"
          />
        ))}
      </div>
    );
  }

  if (list.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="meta uppercase tracking-[0.18em]">Sources</div>
        <span className="meta">{list.length}</span>
      </div>
      <ol className="space-y-1">
        {list.map((s) => {
          const isHi = highlightedIndex === s.index;
          return (
            <li key={s.index}>
              <button
                type="button"
                onClick={() => onItemClick?.(s.index)}
                className={`group flex w-full gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-border hover:bg-surface ${
                  isHi ? "border-accent/60 bg-accent-tint/40" : ""
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[11px] ${
                    isHi ? "bg-accent text-bg" : "bg-accent-tint text-accent"
                  }`}
                >
                  {s.index}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-[13px] font-medium leading-snug text-fg group-hover:text-fg">
                    {s.title || "Untitled"}
                  </div>
                  {shortMeta(s) && (
                    <div className="mt-0.5 truncate font-mono text-[10px] text-muted">
                      {shortMeta(s)}
                    </div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
