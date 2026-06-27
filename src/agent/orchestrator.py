from typing import TypedDict, Callable, Optional, Any
from langgraph.graph import StateGraph, START, END
import anthropic
import json
from dotenv import load_dotenv
from ..ingestion.pipeline import ingest
from ..retrieval.reranker import rerank_by_population
from ..retrieval.store import get_client, search
import time

load_dotenv()
llm = anthropic.Anthropic()


Emitter = Callable[[str, dict], None]


def _noop_emit(event: str, data: dict) -> None:
    return None


def _emit(state: "AgentState", event: str, data: dict) -> None:
    emit = state.get("emit") or _noop_emit
    emit(event, data)


def time_node(name, fn):
    def wrapped(state):
        start = time.time()
        result = fn(state)
        elapsed = time.time() - start
        print(f"  {name}: {elapsed:.1f}s")
        _emit(state, "timing", {"node": name, "seconds": round(elapsed, 2)})
        return result
    return wrapped


# 1. The shared state that flows through the graph
class AgentState(TypedDict, total=False):
    red_flags: bool            # true if the description mentions red flags
    user_query: str            # raw plain-language input
    athlete_context: str       # demographics/sport, used later for re-ranking
    diagnoses: list[dict]      # [{"condition": ..., "search_terms": ..., "likelihood": ...}]
    search_results: list[dict] # accumulated chunks from Qdrant
    weak_diagnoses: list[dict] # diagnoses that couldnt make the cut
    ingest_attempts: int       # counter, guard
    final_report: str          # final report of the diagnoses and search results
    emit: Optional[Emitter]    # optional sink for streaming events (None for CLI)


# 2. Node: diagnose
def diagnose_node(state: AgentState) -> dict:
    _emit(state, "node_started", {"node": "diagnose"})
    prompt = f""" You are a sports medicine research assistant. Given an athlete's symptom description, generate a differential of likely conditions to research in medical literature.
    ATHLETE CONTEXT: {state["athlete_context"]}
    SYMPTOM DESCRIPTION: {state["user_query"]}

    Generate the 2-4 most likely conditions. For each condition, provide:
     - "condition": the formal medical condition name ("lateral epicondylitis" instead of "elbow pain")
     - "search_terms": a PubMed query string using the quoted medical term plus rehabilitation qualifiers, formatted like: 'lateral epicondylitis' AND rehabilitation AND exercise
     - "likelihood": "high", "moderate", or "low" - informed by BOTH the symptoms and the athlete's sport/age/activity (a gripping sport makes forearm tendinopathies more likely)
     - "reasoning": a one sentence on why this fits

     Also include a top-level field "red_flags": true if the description mentions numbness, severe swelling, acute trauma, inability to bear weight, or symptoms suggesting they should see a doctor immediately. Otherwise false.

    Respond with ONLY a JSON object in this exact format, no markdown, no preamble:
    {{
        "red_flags": false,
        "differentials": [
            {{
                "condition": "...",
                "search_terms": "...",
                "likelihood": "...",
                "reasoning": "..."
            }}
        ]
    }}
    In search_terms, wrap medical phrases in single quotes,
    not double quotes (e.g. 'lateral epicondylitis' AND rehabilitation AND exercise),
    since your output must be valid JSON.
    """
    response = llm.messages.create(
        model="claude-haiku-4-5",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        repair = llm.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=600,
            messages=[{"role": "user", "content": f"Fix this so it is valid JSON. Return ONLY the corrected JSON:\n{text}"}],
        )
        parsed = json.loads(repair.content[0].text.strip())

    diagnoses = parsed["differentials"]
    red_flags = parsed["red_flags"]
    _emit(state, "diagnoses", {"diagnoses": diagnoses, "red_flags": red_flags})
    return {"diagnoses": diagnoses, "red_flags": red_flags}


MIN_SCORE = 0.70
MIN_CHUNKS = 3


def evaluate_coverage_node(state: AgentState) -> dict:
    _emit(state, "node_started", {"node": "evaluate"})
    weak = []
    for dx in state["diagnoses"]:
        relevant = [
            r for r in state["search_results"]
            if r["diagnosis"] == dx["condition"] and r["score"] >= MIN_SCORE
        ]
        if len(relevant) < MIN_CHUNKS:
            weak.append(dx["condition"])
    _emit(state, "weak_diagnoses", {"weak_diagnoses": weak})
    return {"weak_diagnoses": weak}


# attempt 0: full query; attempt 1: drop trailing qualifiers, keep term + rehabilitation
def broaden_query(search_terms: str, attempt: int) -> str:
    parts = search_terms.split(" AND ")
    keep = max(2, len(parts) - attempt * 2)
    return " AND ".join(parts[:keep])


def ingest_node(state: AgentState) -> dict:
    attempt = state["ingest_attempts"]
    _emit(state, "node_started", {"node": "ingest", "attempt": attempt})
    targets = []
    for dx in state["diagnoses"]:
        if dx["condition"] in state["weak_diagnoses"]:
            query = broaden_query(dx["search_terms"], attempt)
            pubmed_query = query.replace("'", '"')
            targets.append({"condition": dx["condition"], "query": pubmed_query})
            _emit(state, "ingest_started", {"condition": dx["condition"], "query": pubmed_query, "attempt": attempt})
            ingest(pubmed_query, max_papers=15)
    _emit(state, "ingest_complete", {"targets": targets, "attempt": attempt + 1})
    return {"ingest_attempts": attempt + 1}


def route_after_coverage(state: AgentState) -> str:
    if state["weak_diagnoses"] and state["ingest_attempts"] < 2:
        return "ingest"
    return "rerank"


# 3. Node: search
def search_node(state: AgentState) -> dict:
    _emit(state, "node_started", {"node": "search"})
    client = get_client()
    all_results = []
    per_diagnosis = []
    for dx in state["diagnoses"]:
        results = search(client, dx["search_terms"], limit=5)
        for r in results:
            r["diagnosis"] = dx["condition"]
        all_results.extend(results)
        per_diagnosis.append({"condition": dx["condition"], "count": len(results)})
    _emit(state, "search_results", {
        "per_diagnosis": per_diagnosis,
        "results": all_results,
    })
    return {"search_results": all_results}


def _format_author(name: str) -> str:
    """'Askling, Carl' -> 'Askling C'."""
    if not name:
        return ""
    if "," in name:
        last, first = [p.strip() for p in name.split(",", 1)]
    else:
        parts = name.strip().split()
        if len(parts) < 2:
            return name.strip()
        last, first = parts[-1], " ".join(parts[:-1])
    initials = "".join(p[0] for p in first.split() if p and p[0].isalpha())
    return f"{last} {initials}".strip()


def _author_line(authors: list[str]) -> str:
    if not authors:
        return "Unknown author"
    head = _format_author(authors[0])
    return f"{head} et al." if len(authors) > 1 else head


TOP_K_SOURCES = 8


def generate_report_node(state: AgentState) -> dict:
    _emit(state, "node_started", {"node": "synthesize"})

    # search_results is reranked at this point (highest population fit first, ties broken by semantic score)
    all_sources = list(state["search_results"])
    top_sources = all_sources[:TOP_K_SOURCES]

    indexed_sources = []
    for i, s in enumerate(top_sources):
        indexed_sources.append({
            "index": i + 1,
            "pmid": s.get("pmid", ""),
            "title": s.get("title", ""),
            "year": s.get("year"),
            "study_design": s.get("study_design"),
            "population_score": s.get("population_score"),
            "population_reason": s.get("population_reason"),
            "score": s.get("score"),
            "text": s.get("text", ""),
            "authors": s.get("authors", []),
            "author_line": _author_line(s.get("authors", [])),
            "diagnosis": s.get("diagnosis"),
        })

    _emit(state, "final_sources", {"sources": indexed_sources})

    diagnoses_hint = "\n".join([
        f"- {d['condition']} ({d['likelihood']} likelihood): {d['reasoning']}"
        for d in state["diagnoses"]
    ]) or "(no differentials)"

    if not indexed_sources:
        sources_block = "(no sources retrieved — answer must acknowledge this)"
    else:
        sources_block = "\n\n".join([
            f"[{s['index']}] \"{s['title']}\" — {s['author_line']} · {s.get('study_design') or 'unknown'} · {s.get('year') or 'n.d.'} · pop-fit {s.get('population_score', '?')}/5\n"
            f"    Excerpt: {s['text'][:320]}"
            for s in indexed_sources
        ])

    weak = ", ".join(state["weak_diagnoses"]) or "none"

    prompt = f"""You are a sports medicine evidence summarizer. Given a user's injury description and a numbered list of retrieved sources, write a concise answer that synthesizes what current evidence suggests.

USER DESCRIPTION:
{state["user_query"]}

ATHLETE CONTEXT:
{state["athlete_context"]}

RED FLAGS DETECTED: {state["red_flags"]}
WEAK COVERAGE DIAGNOSES: {weak}

DIFFERENTIAL HYPOTHESES (the agent's internal frame — synthesize across these, do not enumerate them in the answer):
{diagnoses_hint}

SOURCES (numbered, ordered by population fit):
{sources_block}

RULES:
1. You are NOT diagnosing. Phrase findings as "this fits the pattern of X" or "evidence suggests..." — never "you have X."
2. Cite using the numbered source indices in square brackets, e.g. [1], [2], [3,4]. NEVER write PMIDs in the prose. Every clinical claim must be cited.
3. Favor higher-tier evidence (systematic reviews and RCTs over case reports). When relying on weaker evidence, name the design briefly.
4. If two sources disagree, surface the disagreement explicitly with both citations.
5. Note population fit when a source's study population may not match the user.
6. If RED FLAGS DETECTED is True, lead with a brief safety prompt in the very first sentence of the synthesis, advising the user to see a clinician.

OUTPUT FORMAT (markdown, in this exact order, using these exact headings):

## Synthesis
Two to four short paragraphs. Bold the central claim of each paragraph using **markdown bold**. Use [N] citations inline. Plain, conversational prose — write for the athlete, not for a clinician.

## Bottom line
ONE short paragraph (2-3 sentences). Plain language, no citations, no hedging. Lead with the practical answer (e.g. a target timeframe or condition), then the criteria/conditions that change it.

## Next steps
Exactly three numbered items. Each item starts with a short bold action title followed by a period, then one sentence of plain-language detail. Examples of good titles: "Pass the strength gate.", "Rebuild running volume.", "Confirm mechanics."

Write the answer now."""
    full_text = ""
    with llm.messages.stream(
        model="claude-sonnet-4-5",
        max_tokens=3000,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        for chunk in stream.text_stream:
            print(chunk, end="", flush=True)
            full_text += chunk
            _emit(state, "report_token", {"token": chunk})
    print("\n")
    _emit(state, "report_complete", {"report": full_text})
    return {"final_report": full_text}


def rerank_node(state: AgentState) -> dict:
    _emit(state, "node_started", {"node": "rerank"})
    seen = {}
    for r in state["search_results"]:
        pmid = r["pmid"]
        if pmid not in seen or r["score"] > seen[pmid]["score"]:
            seen[pmid] = r
    ranked = rerank_by_population(list(seen.values()), state["athlete_context"])
    _emit(state, "rerank_complete", {"results": ranked})
    return {"search_results": ranked}


# 4. Wire the graph
def build_graph():
    g = StateGraph(AgentState)

    g.add_node("diagnose", time_node("diagnose", diagnose_node))
    g.add_node("search", time_node("search", search_node))
    g.add_node("evaluate", time_node("evaluate", evaluate_coverage_node))
    g.add_node("ingest", time_node("ingest", ingest_node))
    g.add_node("rerank", time_node("rerank", rerank_node))
    g.add_node("synthesize", time_node("synthesize", generate_report_node))

    g.add_edge(START, "diagnose")
    g.add_edge("diagnose", "search")
    g.add_edge("search", "evaluate")
    g.add_conditional_edges("evaluate", route_after_coverage, {"ingest": "ingest", "rerank": "rerank"})
    g.add_edge("ingest", "search")
    g.add_edge("rerank", "synthesize")
    g.add_edge("synthesize", END)

    return g.compile()


def run(user_query: str, athlete_context: str, emit: Optional[Emitter] = None) -> dict[str, Any]:
    """Single entry point used by both the CLI and the API.

    `emit(event, data)` is called as the graph progresses. Pass None for silent runs.
    """
    graph = build_graph()
    return graph.invoke({
        "user_query": user_query,
        "athlete_context": athlete_context,
        "diagnoses": [],
        "search_results": [],
        "red_flags": False,
        "weak_diagnoses": [],
        "ingest_attempts": 0,
        "final_report": "",
        "emit": emit,
    })


if __name__ == "__main__":
    test_cases = [
        {
            "user_query": "outside of my elbow hurts when I grip, started 6 weeks ago",
            "athlete_context": "28-year-old male, recreational rock climber, trains 4x/week",
        }
    ]

    for tc in test_cases:
        print("=" * 70)
        print(f"QUERY: {tc['user_query']}")
        print(f"CONTEXT: {tc['athlete_context']}")
        print("=" * 70)

        result = run(tc["user_query"], tc["athlete_context"])
        print("\n")

        DEBUG = False
        if DEBUG:
            print(f"RED FLAGS: {result['red_flags']}")
            print(f"INGEST ATTEMPTS: {result['ingest_attempts']}")
            print(f"WEAK DIAGNOSES: {result['weak_diagnoses']}")
            for r in result["search_results"][:5]:
                print(f"  [pop {r.get('population_score', '?')}] [{r['score']:.2f}] {r['title'][:60]}")
            print(f"FINAL REPORT: {result['final_report']}")
