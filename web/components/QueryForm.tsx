"use client";

import { useState } from "react";
import type { AthleteContextInput } from "@/lib/types";

interface Props {
  onSubmit: (userQuery: string, athlete: AthleteContextInput) => void;
  busy: boolean;
}

const SAMPLES: { label: string; query: string; athlete: AthleteContextInput }[] = [
  {
    label: "Rock climber, elbow pain",
    query: "outside of my elbow hurts when I grip, started 6 weeks ago",
    athlete: { age: 28, sex: "male", sport: "rock climbing", training_frequency: "4x/week", symptom_duration: "6 weeks" },
  },
  {
    label: "Runner, shin pain",
    query: "sharp pain along the inside of my shin during runs, worse on hills",
    athlete: { age: 32, sex: "female", sport: "distance running", training_frequency: "50km/week", symptom_duration: "3 weeks" },
  },
  {
    label: "Tennis, shoulder",
    query: "shoulder ache when I serve, weak when I reach overhead",
    athlete: { age: 41, sex: "male", sport: "tennis", training_frequency: "3x/week", symptom_duration: "2 months" },
  },
];

export default function QueryForm({ onSubmit, busy }: Props) {
  const [query, setQuery] = useState("");
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState("");
  const [sport, setSport] = useState("");
  const [freq, setFreq] = useState("");
  const [duration, setDuration] = useState("");

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

  return (
    <div className="border-t border-ink-200 bg-white p-4">
      <div className="mx-auto max-w-5xl space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-ink-700">Describe your symptoms</label>
          <div className="flex gap-2 text-xs">
            <span className="text-ink-400">Try:</span>
            {SAMPLES.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => loadSample(i)}
                disabled={busy}
                className="text-accent hover:text-accent-hover underline-offset-2 hover:underline disabled:opacity-40"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g., outside of my elbow hurts when I grip, started 6 weeks ago"
          rows={2}
          disabled={busy}
          className="w-full resize-none rounded-md border border-ink-200 px-3 py-2 text-sm outline-none focus:border-accent disabled:bg-ink-50"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="Age"
            disabled={busy}
            className="rounded-md border border-ink-200 px-2 py-1.5 text-sm outline-none focus:border-accent disabled:bg-ink-50"
          />
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value)}
            disabled={busy}
            className="rounded-md border border-ink-200 px-2 py-1.5 text-sm outline-none focus:border-accent disabled:bg-ink-50"
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
            className="rounded-md border border-ink-200 px-2 py-1.5 text-sm outline-none focus:border-accent disabled:bg-ink-50 md:col-span-2"
          />
          <input
            value={freq}
            onChange={(e) => setFreq(e.target.value)}
            placeholder="Training (e.g. 4x/week)"
            disabled={busy}
            className="rounded-md border border-ink-200 px-2 py-1.5 text-sm outline-none focus:border-accent disabled:bg-ink-50"
          />
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Duration"
            disabled={busy}
            className="rounded-md border border-ink-200 px-2 py-1.5 text-sm outline-none focus:border-accent disabled:bg-ink-50"
          />
        </div>
        <div className="flex items-center justify-between text-xs text-ink-400">
          <span>Cmd/Ctrl+Enter to run</span>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !query.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-ink-300"
          >
            {busy ? "Running…" : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}
