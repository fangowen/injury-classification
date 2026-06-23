export type Likelihood = "high" | "moderate" | "low";

export interface Diagnosis {
  condition: string;
  search_terms: string;
  likelihood: Likelihood;
  reasoning: string;
}

export interface RetrievedChunk {
  score: number;
  text: string;
  pmid: string;
  section?: string;
  title?: string;
  year?: string;
  study_design?: string;
  diagnosis?: string;
  population_score?: number;
  population_reason?: string;
  authors?: string[];
}

export interface FinalSource {
  index: number;
  pmid: string;
  title: string;
  year?: string | null;
  study_design?: string | null;
  population_score?: number | null;
  population_reason?: string | null;
  score?: number | null;
  text: string;
  authors: string[];
  author_line: string;
  diagnosis?: string | null;
}

export interface AthleteContextInput {
  age?: number;
  sex?: string;
  sport?: string;
  training_frequency?: string;
  symptom_duration?: string;
  notes?: string;
}

export type AgentEvent =
  | { event: "run_started"; data: { user_query: string; athlete_context: string } }
  | { event: "node_started"; data: { node: string; attempt?: number } }
  | { event: "timing"; data: { node: string; seconds: number } }
  | { event: "diagnoses"; data: { diagnoses: Diagnosis[]; red_flags: boolean } }
  | { event: "search_results"; data: { per_diagnosis: { condition: string; count: number }[]; results: RetrievedChunk[] } }
  | { event: "weak_diagnoses"; data: { weak_diagnoses: string[] } }
  | { event: "ingest_started"; data: { condition: string; query: string; attempt: number } }
  | { event: "ingest_complete"; data: { targets: { condition: string; query: string }[]; attempt: number } }
  | { event: "rerank_complete"; data: { results: RetrievedChunk[] } }
  | { event: "final_sources"; data: { sources: FinalSource[] } }
  | { event: "report_token"; data: { token: string } }
  | { event: "report_complete"; data: { report: string } }
  | { event: "done"; data: { red_flags: boolean; weak_diagnoses: string[]; ingest_attempts: number } }
  | { event: "error"; data: { message: string; trace?: string } }
  | { event: "stream_end"; data: Record<string, never> };
