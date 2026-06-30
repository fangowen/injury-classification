"use client";

import type { Diagnosis } from "@/lib/types";

interface Props {
  query: string;
  diagnoses: Diagnosis[];
  retrievedCount: number;
  elapsedSeconds: number;
  sourceCount: number;
  streaming: boolean;
}

export default function AskedQuestion({
  query,
  diagnoses,
  retrievedCount,
  elapsedSeconds,
  sourceCount,
  streaming,
}: Props) {
  const primary = diagnoses[0];
  const chipLabel = primary?.condition ?? (streaming ? "Working" : "Topic");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="chip">{chipLabel}</span>
        {retrievedCount > 0 ? (
          <span className="meta">
            retrieved {retrievedCount} papers
            {elapsedSeconds > 0 ? ` · ${elapsedSeconds.toFixed(1)}s` : ""}
          </span>
        ) : streaming ? (
          <span className="meta inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse-soft bg-fg" />
            working
          </span>
        ) : null}
      </div>

      <h1 className="font-display text-[38px] font-bold leading-[1.05] tracking-tight text-fg md:text-[56px]">
        {query}
      </h1>

      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted">
        <span className="inline-block h-1.5 w-1.5 bg-fg" />
        {sourceCount > 0
          ? `Synthesized from ${sourceCount} peer-reviewed source${sourceCount === 1 ? "" : "s"}`
          : streaming
          ? "Gathering peer-reviewed sources…"
          : "No sources retrieved"}
      </div>
    </div>
  );
}
