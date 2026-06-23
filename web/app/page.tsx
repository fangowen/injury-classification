"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import AskedQuestion from "@/components/AskedQuestion";
import QueryComposer from "@/components/QueryComposer";
import ReportStream from "@/components/ReportStream";
import SafetyBanner from "@/components/SafetyBanner";
import Sources from "@/components/Sources";
import SourcesSidebar from "@/components/SourcesSidebar";
import { openStream, startQuery } from "@/lib/sse";
import type {
  AgentEvent,
  AthleteContextInput,
  Diagnosis,
  FinalSource,
  RetrievedChunk,
} from "@/lib/types";

interface SubmittedQuery {
  query: string;
  athlete: AthleteContextInput;
}

export default function HomePage() {
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<SubmittedQuery | null>(null);

  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [results, setResults] = useState<RetrievedChunk[]>([]);
  const [finalSources, setFinalSources] = useState<FinalSource[]>([]);
  const [report, setReport] = useState("");
  const [redFlags, setRedFlags] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  function resetState() {
    setDiagnoses([]);
    setResults([]);
    setFinalSources([]);
    setReport("");
    setRedFlags(false);
    setError(null);
    setElapsed(0);
    setHighlightIndex(null);
  }

  function fullReset() {
    if (closeRef.current) closeRef.current();
    setBusy(false);
    setSubmitted(null);
    resetState();
  }

  const onEvent = useCallback((e: AgentEvent) => {
    switch (e.event) {
      case "timing":
        setElapsed((prev) => prev + e.data.seconds);
        break;
      case "diagnoses":
        setDiagnoses(e.data.diagnoses);
        setRedFlags(e.data.red_flags);
        break;
      case "search_results":
        setResults((prev) => mergeResults(prev, e.data.results));
        break;
      case "rerank_complete":
        setResults(e.data.results);
        break;
      case "final_sources":
        setFinalSources(e.data.sources);
        break;
      case "report_token":
        setReport((r) => r + e.data.token);
        break;
      case "report_complete":
        setReport(e.data.report);
        break;
      case "done":
      case "stream_end":
        setBusy(false);
        break;
      case "error":
        setError(e.data.message);
        setBusy(false);
        break;
    }
  }, []);

  async function handleSubmit(query: string, athlete: AthleteContextInput) {
    if (closeRef.current) closeRef.current();
    resetState();
    setSubmitted({ query, athlete });
    setBusy(true);
    try {
      const runId = await startQuery(query, athlete);
      closeRef.current = openStream(runId, onEvent, () => setBusy(false));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
      setBusy(false);
    }
  }

  function handleCitationClick(index: number) {
    const el = document.getElementById(`source-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightIndex(index);
      setTimeout(() => setHighlightIndex(null), 1500);
    }
  }

  const retrievedCount = useMemo(() => {
    const pmids = new Set(results.map((r) => r.pmid).filter(Boolean));
    return pmids.size;
  }, [results]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-bg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-bg">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <span className="font-serif text-2xl font-semibold tracking-tight text-fg">Mend</span>
          </div>
          {submitted && (
            <button type="button" onClick={fullReset} className="btn-ghost">
              New question
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 md:py-14">
        {!submitted ? (
          <div className="mx-auto max-w-3xl space-y-10">
            <div className="space-y-3">
              <h1 className="font-serif text-4xl font-medium leading-tight tracking-tight text-fg md:text-5xl">
                What's bothering you?
              </h1>
              <p className="max-w-xl text-base text-muted md:text-lg">
                Describe your symptoms in plain language. The agent generates a differential, pulls
                supporting evidence from PubMed, and writes a concise answer with citations.
              </p>
            </div>
            <QueryComposer onSubmit={handleSubmit} busy={busy} />
            <div className="meta">Not medical advice · For educational use only</div>
          </div>
        ) : (
          <div className="space-y-16">
            {/* Above-the-fold: answer column + sticky compact sidebar */}
            <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_300px] md:gap-12 lg:gap-16">
              <div className="min-w-0 space-y-10">
                <AskedQuestion
                  query={submitted.query}
                  diagnoses={diagnoses}
                  retrievedCount={retrievedCount}
                  elapsedSeconds={elapsed}
                  sourceCount={finalSources.length || retrievedCount}
                  streaming={busy}
                />

                {redFlags && <SafetyBanner />}

                {error && (
                  <div className="rounded-2xl border border-red-500/40 bg-red-50/60 px-5 py-4 text-sm text-red-900">
                    {error}
                  </div>
                )}

                <ReportStream
                  text={report}
                  streaming={busy}
                  onCitationClick={handleCitationClick}
                />
              </div>

              <aside className="hidden md:block">
                <div className="sticky top-6">
                  <SourcesSidebar
                    sources={finalSources}
                    fallback={results}
                    highlightedIndex={highlightIndex}
                    loading={busy && finalSources.length === 0}
                    onItemClick={handleCitationClick}
                  />
                </div>
              </aside>
            </div>

            {/* Below-the-fold: full-width detailed sources */}
            <section id="sources-detailed" className="border-t border-border pt-12">
              <Sources
                sources={finalSources}
                fallback={results}
                highlightedIndex={highlightIndex}
                loading={busy && finalSources.length === 0}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function mergeResults(prev: RetrievedChunk[], next: RetrievedChunk[]): RetrievedChunk[] {
  const map = new Map<string, RetrievedChunk>();
  for (const r of prev) map.set(r.pmid, r);
  for (const r of next) {
    const existing = map.get(r.pmid);
    if (!existing || (r.score ?? 0) > (existing.score ?? 0)) map.set(r.pmid, r);
  }
  return Array.from(map.values());
}
