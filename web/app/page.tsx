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
      <header className="border-b-2 border-border bg-bg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center border border-border bg-fg text-bg">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <span className="font-display text-2xl font-bold uppercase tracking-tight text-fg">Mend</span>
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
            <div className="space-y-6">
              {/* Hero decorative punctuation — thick rule + bordered square. */}
              <div className="flex items-center gap-3">
                <span className="h-1 w-16 bg-fg" />
                <span className="h-2.5 w-2.5 border border-border" />
              </div>
              <h1 className="font-display text-5xl font-bold leading-[0.95] tracking-tight text-fg md:text-7xl">
                What&apos;s bothering you?
              </h1>
              <p className="max-w-xl font-serif text-lg leading-relaxed text-muted md:text-xl">
                Describe your symptoms in plain language. The agent generates a differential, pulls
                supporting evidence from PubMed, and writes a concise answer with citations.
              </p>
            </div>
            <QueryComposer onSubmit={handleSubmit} busy={busy} />
            <div className="meta uppercase tracking-widest">Not medical advice · For educational use only</div>
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
                  <div className="border border-border border-l-[6px] bg-surface-2 px-5 py-4">
                    <div className="meta mb-1 uppercase tracking-widest text-fg">Error</div>
                    <div className="font-serif text-[15px] text-fg">{error}</div>
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
            <section id="sources-detailed" className="border-t-4 border-border pt-12">
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
