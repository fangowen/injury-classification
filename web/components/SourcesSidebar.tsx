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
        <div className="meta uppercase tracking-[0.2em] text-fg">Sources</div>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 animate-shimmer border border-border-light bg-gradient-to-r from-surface-2 via-border-light to-surface-2 bg-[length:200%_100%]"
          />
        ))}
      </div>
    );
  }

  if (list.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="meta uppercase tracking-[0.2em] text-fg">Sources</div>
        <span className="meta">{list.length}</span>
      </div>
      <ol className="space-y-px">
        {list.map((s) => {
          const isHi = highlightedIndex === s.index;
          return (
            <li key={s.index}>
              <button
                type="button"
                onClick={() => onItemClick?.(s.index)}
                className={`group flex w-full gap-3 border border-transparent px-2 py-2 text-left transition-colors duration-100 hover:border-border hover:bg-surface-2 ${
                  isHi ? "border-border border-l-4 bg-surface-2" : ""
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-border font-mono text-[11px] ${
                    isHi ? "bg-fg text-bg" : "bg-bg text-fg"
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
