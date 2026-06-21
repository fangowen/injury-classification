"use client";

import { useMemo } from "react";
import type { RetrievedChunk } from "@/lib/types";

interface Props {
  results: RetrievedChunk[];
  highlightedPmid?: string | null;
}

export default function EvidenceDrawer({ results, highlightedPmid }: Props) {
  const grouped = useMemo(() => {
    const seen = new Map<string, RetrievedChunk>();
    for (const r of results) {
      const existing = seen.get(r.pmid);
      if (!existing || (r.score ?? 0) > (existing.score ?? 0)) seen.set(r.pmid, r);
    }
    const out = new Map<string, RetrievedChunk[]>();
    for (const r of seen.values()) {
      const key = r.diagnosis ?? "Other";
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(r);
    }
    for (const list of out.values()) {
      list.sort((a, b) => (b.population_score ?? 0) - (a.population_score ?? 0) || (b.score ?? 0) - (a.score ?? 0));
    }
    return Array.from(out.entries());
  }, [results]);

  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-ink-200 bg-white p-4 text-sm text-ink-400">
        Retrieved papers will show up here as the agent runs.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(([condition, papers]) => (
        <div key={condition} className="rounded-lg border border-ink-200 bg-white">
          <div className="border-b border-ink-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            {condition}{" "}
            <span className="ml-2 normal-case text-ink-400">({papers.length} papers)</span>
          </div>
          <ul className="divide-y divide-ink-100">
            {papers.map((p) => (
              <li
                key={p.pmid}
                id={`evidence-${p.pmid}`}
                className={`evidence-card px-4 py-3 text-sm ${highlightedPmid === p.pmid ? "flash" : ""}`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-ink-600">
                    PMID {p.pmid}
                  </span>
                  {p.study_design && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                      {p.study_design}
                    </span>
                  )}
                  {p.year && <span className="text-ink-400">{p.year}</span>}
                  {p.population_score != null && (
                    <span
                      className={
                        p.population_score >= 4
                          ? "rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700"
                          : p.population_score >= 3
                          ? "rounded bg-amber-50 px-1.5 py-0.5 text-amber-700"
                          : "rounded bg-ink-100 px-1.5 py-0.5 text-ink-600"
                      }
                      title={p.population_reason}
                    >
                      pop {p.population_score}/5
                    </span>
                  )}
                  <span className="ml-auto font-mono text-ink-400">
                    sim {(p.score ?? 0).toFixed(2)}
                  </span>
                </div>
                <div className="mb-1 font-medium text-ink-800">{p.title}</div>
                <div className="line-clamp-3 text-ink-600">{p.text.replace(/^\[[^\]]+\]\s*/, "")}</div>
                <a
                  href={`https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-accent hover:text-accent-hover hover:underline"
                >
                  Open in PubMed →
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
