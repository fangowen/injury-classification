"use client";

import { useState } from "react";
import type { AthleteContextInput } from "@/lib/types";

interface Props {
  onSubmit: (userQuery: string, athlete: AthleteContextInput) => void;
  busy: boolean;
  placeholder?: string;
  compact?: boolean;
}

const SAMPLES: { label: string; query: string; athlete: AthleteContextInput }[] = [
  {
    label: "Climber, elbow",
    query: "outside of my elbow hurts when I grip, started 6 weeks ago",
    athlete: { age: 28, sex: "male", sport: "rock climbing", training_frequency: "4x/week", symptom_duration: "6 weeks" },
  },
  {
    label: "Runner, shin",
    query: "sharp pain along the inside of my shin during runs, worse on hills",
    athlete: { age: 32, sex: "female", sport: "distance running", training_frequency: "50km/week", symptom_duration: "3 weeks" },
  },
  {
    label: "Tennis, shoulder",
    query: "shoulder ache when I serve, weak when I reach overhead",
    athlete: { age: 41, sex: "male", sport: "tennis", training_frequency: "3x/week", symptom_duration: "2 months" },
  },
];

export default function QueryComposer({
  onSubmit,
  busy,
  placeholder = "Describe what hurts, when it started, what makes it worse…",
  compact = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [sport, setSport] = useState("");
  const [freq, setFreq] = useState("");
  const [duration, setDuration] = useState("");
  const [expanded, setExpanded] = useState(false);

  function submit() {
    if (!query.trim() || busy) return;
    onSubmit(query.trim(), {
      age: age ? Number(age) : undefined,
      sex: sex || undefined,
      sport: sport || undefined,
      training_frequency: freq || undefined,
      symptom_duration: duration || undefined,
    });
  }

  function loadSample(i: number) {
    const s = SAMPLES[i];
    setQuery(s.query);
    setAge(s.athlete.age?.toString() ?? "");
    setSex(s.athlete.sex ?? "");
    setSport(s.athlete.sport ?? "");
    setFreq(s.athlete.training_frequency ?? "");
    setDuration(s.athlete.symptom_duration ?? "");
  }

  const hasContext = age || sex || sport || freq || duration;

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          disabled={busy}
          autoFocus={!compact}
          className="field pr-16"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !query.trim()}
          aria-label="Submit question"
          className="btn-send absolute right-1.5 top-1/2 -translate-y-1/2"
        >
          {busy ? (
            <span className="h-2 w-2 animate-pulse bg-current" />
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          )}
        </button>
      </div>

      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="btn-context"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {hasContext ? "Athlete context" : "Add athlete context"}
            <span className="text-subtle">{expanded ? "−" : "+"}</span>
          </button>
          <span className="meta ml-1 hidden sm:inline">Try:</span>
          {SAMPLES.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => loadSample(i)}
              disabled={busy}
              className="btn-context disabled:opacity-40"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {!compact && expanded && (
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="Age"
            disabled={busy}
            className="border border-border bg-bg px-3.5 py-2 text-sm outline-none transition-colors duration-100 focus:border-2 placeholder:text-subtle disabled:opacity-60 w-20"
          />
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value)}
            disabled={busy}
            className="border border-border bg-bg px-3.5 py-2 text-sm outline-none transition-colors duration-100 focus:border-2 disabled:opacity-60 w-28"
          >
            <option value="">Sex</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          <input
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            placeholder="Sport"
            disabled={busy}
            className="border border-border bg-bg px-3.5 py-2 text-sm outline-none transition-colors duration-100 focus:border-2 placeholder:text-subtle disabled:opacity-60 flex-1 min-w-[8rem]"
          />
          <input
            value={freq}
            onChange={(e) => setFreq(e.target.value)}
            placeholder="Training (e.g. 4x/week)"
            disabled={busy}
            className="border border-border bg-bg px-3.5 py-2 text-sm outline-none transition-colors duration-100 focus:border-2 placeholder:text-subtle disabled:opacity-60 flex-1 min-w-[10rem]"
          />
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Duration (e.g. 6 weeks)"
            disabled={busy}
            className="border border-border bg-bg px-3.5 py-2 text-sm outline-none transition-colors duration-100 focus:border-2 placeholder:text-subtle disabled:opacity-60 flex-1 min-w-[10rem]"
          />
        </div>
      )}
    </div>
  );
}
