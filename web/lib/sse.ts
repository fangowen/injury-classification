import type { AgentEvent, AthleteContextInput } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export async function startQuery(
  userQuery: string,
  athlete: AthleteContextInput,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_query: userQuery, athlete_context: athlete }),
  });
  if (!res.ok) throw new Error(`query failed: ${res.status}`);
  const json = (await res.json()) as { run_id: string };
  return json.run_id;
}

export function openStream(
  runId: string,
  onEvent: (e: AgentEvent) => void,
  onError?: (err: Event) => void,
): () => void {
  const es = new EventSource(`${API_BASE}/api/stream/${runId}`);

  const EVENT_NAMES: AgentEvent["event"][] = [
    "run_started",
    "node_started",
    "timing",
    "diagnoses",
    "search_results",
    "weak_diagnoses",
    "ingest_started",
    "ingest_complete",
    "rerank_complete",
    "report_token",
    "report_complete",
    "done",
    "error",
    "stream_end",
  ];

  for (const name of EVENT_NAMES) {
    es.addEventListener(name, (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as AgentEvent;
        onEvent(parsed);
        if (parsed.event === "stream_end") es.close();
      } catch (e) {
        console.error("bad SSE payload", e);
      }
    });
  }

  es.onerror = (err) => {
    onError?.(err);
    es.close();
  };

  return () => es.close();
}
