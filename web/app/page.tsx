"use client";

import { useCallback, useRef, useState } from "react";
import EvidenceDrawer from "@/components/EvidenceDrawer";
import QueryForm from "@/components/QueryForm";
import ReportStream from "@/components/ReportStream";
import SafetyBanner from "@/components/SafetyBanner";
import Timeline, { type TimelineStep } from "@/components/Timeline";
import { openStream, startQuery } from "@/lib/sse";
import type {
  AgentEvent,
  AthleteContextInput,
  Diagnosis,
  RetrievedChunk,
} from "@/lib/types";

export default function HomePage() {
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [weakDiagnoses, setWeakDiagnoses] = useState<string[]>([]);
  const [paperCounts, setPaperCounts] = useState<{ condition: string; count: number }[]>([]);
  const [results, setResults] = useState<RetrievedChunk[]>([]);
  const [report, setReport] = useState("");
  const [redFlags, setRedFlags] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightPmid, setHighlightPmid] = useState<string | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  function reset() {
    setSteps([]);
    setDiagnoses([]);
    setWeakDiagnoses([]);
    setPaperCounts([]);
    setResults([]);
    setReport("");
    setRedFlags(false);
    setError(null);
    setHighlightPmid(null);
  }

  const onEvent = useCallback((e: AgentEvent) => {
    switch (e.event) {
      case "node_started":
        setSteps((prev) => {
          const open = prev.findIndex((s) => s.status === "running");
          const next = [...prev];
          if (open >= 0) next[open] = { ...next[open], status: "done" };
          next.push({ node: e.data.node, status: "running" });
          return next;
        });
        break;
      case "timing":
        setSteps((prev) =>
          prev.map((s) =>
            s.node === e.data.node && s.status !== "done"
              ? { ...s, status: "done", seconds: e.data.seconds }
              : s,
          ),
        );
        break;
      case "diagnoses":
        setDiagnoses(e.data.diagnoses);
        setRedFlags(e.data.red_flags);
        break;
      case "search_results":
        setPaperCounts(e.data.per_diagnosis);
        setResults((prev) => mergeResults(prev, e.data.results));
        break;
      case "weak_diagnoses":
        setWeakDiagnoses(e.data.weak_diagnoses);
        break;
      case "rerank_complete":
        setResults(e.data.results);
        break;
      case "report_token":
        setReport((r) => r + e.data.token);
        break;
      case "report_complete":
        setReport(e.data.report);
        break;
      case "done":
        setBusy(false);
        setSteps((prev) =>
          prev.map((s) => (s.status === "running" ? { ...s, status: "done" } : s)),
        );
        break;
      case "error":
        setError(e.data.message);
        setBusy(false);
        break;
      case "stream_end":
        setBusy(false);
        break;
    }
  }, []);

  async function handleSubmit(query: string, athlete: AthleteContextInput) {
    if (closeRef.current) closeRef.current();
    reset();
    setBusy(true);
    try {
      const runId = await startQuery(query, athlete);
      closeRef.current = openStream(runId, onEvent, () => {
        setBusy(false);
      });
    } catch (e: any) {
      setError(e.message ?? "Request failed");
      setBusy(false);
    }
  }

  function handleCitationClick(pmid: string) {
    const el = document.getElementById(`evidence-${pmid}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightPmid(pmid);
      setTimeout(() => setHighlightPmid(null), 1400);
    } else {
      window.open(`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, "_blank");
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏃</span>
            <h1 className="text-base font-semibold text-ink-800">rehab-synth</h1>
            <span className="text-xs text-ink-400">sports rehab evidence over PubMed</span>
          </div>
          <div className="text-xs text-ink-400">demo</div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6">
        <section className="flex-1 min-w-0">
          {redFlags && <SafetyBanner />}
          {error && (
            <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
          <Timeline
            steps={steps}
            diagnoses={diagnoses}
            weakDiagnoses={weakDiagnoses}
            paperCounts={paperCounts}
          />
          <ReportStream
            text={report}
            streaming={busy && report.length > 0}
            onCitationClick={handleCitationClick}
          />
        </section>

        <aside className="hidden w-96 shrink-0 md:block">
          <div className="sticky top-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Evidence
            </div>
            <EvidenceDrawer results={results} highlightedPmid={highlightPmid} />
          </div>
        </aside>
      </main>

      <QueryForm onSubmit={handleSubmit} busy={busy} />
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
