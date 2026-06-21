"use client";

import type { Diagnosis } from "@/lib/types";

export interface TimelineStep {
  node: string;
  status: "running" | "done";
  seconds?: number;
  detail?: string;
}

const LABELS: Record<string, string> = {
  diagnose: "Generated differential",
  search: "Searched Qdrant",
  evaluate: "Evaluated coverage",
  ingest: "Ingested more papers",
  rerank: "Reranked by population fit",
  synthesize: "Synthesized report",
};

const ACTIVE_LABELS: Record<string, string> = {
  diagnose: "Generating differential…",
  search: "Searching the knowledge base…",
  evaluate: "Evaluating evidence coverage…",
  ingest: "Pulling more papers from PubMed…",
  rerank: "Reranking by population fit…",
  synthesize: "Synthesizing report…",
};

interface Props {
  steps: TimelineStep[];
  diagnoses?: Diagnosis[];
  weakDiagnoses?: string[];
  paperCounts?: { condition: string; count: number }[];
}

export default function Timeline({ steps, diagnoses, weakDiagnoses, paperCounts }: Props) {
  if (steps.length === 0) return null;
  return (
    <div className="mb-4 rounded-lg border border-ink-200 bg-white">
      <div className="border-b border-ink-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
        Agent timeline
      </div>
      <ul className="divide-y divide-ink-100">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="text-base">
              {s.status === "running" ? (
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-accent" />
              ) : (
                <span className="text-emerald-600">✓</span>
              )}
            </span>
            <span className="flex-1 text-ink-700">
              {s.status === "running"
                ? ACTIVE_LABELS[s.node] ?? s.node
                : LABELS[s.node] ?? s.node}
              {s.detail ? <span className="ml-2 text-ink-400">— {s.detail}</span> : null}
            </span>
            {s.seconds != null && (
              <span className="font-mono text-xs text-ink-400">{s.seconds.toFixed(1)}s</span>
            )}
          </li>
        ))}
      </ul>
      {(diagnoses?.length || paperCounts?.length || weakDiagnoses?.length) ? (
        <div className="border-t border-ink-100 px-4 py-3 text-xs text-ink-600">
          {diagnoses && diagnoses.length > 0 && (
            <div className="mb-1">
              <span className="font-semibold text-ink-700">Differentials:</span>{" "}
              {diagnoses.map((d, i) => (
                <span key={i} className="mr-2 inline-block">
                  {d.condition}{" "}
                  <span
                    className={
                      d.likelihood === "high"
                        ? "rounded bg-emerald-100 px-1 text-emerald-700"
                        : d.likelihood === "moderate"
                        ? "rounded bg-amber-100 px-1 text-amber-700"
                        : "rounded bg-ink-100 px-1 text-ink-600"
                    }
                  >
                    {d.likelihood}
                  </span>
                </span>
              ))}
            </div>
          )}
          {paperCounts && paperCounts.length > 0 && (
            <div className="mb-1">
              <span className="font-semibold text-ink-700">Retrieved:</span>{" "}
              {paperCounts.map((p, i) => (
                <span key={i} className="mr-2">
                  {p.condition} ({p.count})
                </span>
              ))}
            </div>
          )}
          {weakDiagnoses && weakDiagnoses.length > 0 && (
            <div className="text-amber-700">
              <span className="font-semibold">Weak coverage:</span> {weakDiagnoses.join(", ")}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
