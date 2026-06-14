from typing import TypedDict
from langgraph.graph import StateGraph, START, END
import anthropic
import json
from dotenv import load_dotenv
from ..ingestion.pipeline import ingest  
from ..retrieval.reranker import rerank_by_population
from ..retrieval.store import get_client, search

load_dotenv()
llm = anthropic.Anthropic()


# 1. The shared state that flows through the graph
class AgentState(TypedDict):
    red_flags: bool            # true if the description mentions red flags
    user_query: str            # raw plain-language input
    athlete_context: str       # demographics/sport, used later for re-ranking
    diagnoses: list[dict]      # [{"condition": ..., "search_terms": ..., "likelihood": ...}]
    search_results: list[dict] # accumulated chunks from Qdrant
    weak_diagnoses: list[dict] # diagnoses that couldnt make the cut
    ingest_attempts: int       # counter, guard
    final_report: str          # final report of the diagnoses and search results


# 2. Node: diagnose
def diagnose_node(state: AgentState) -> dict:
    prompt = f""" You are a sports medicine research assistant. Given an athlete's symptom description, generate a differential of likely conditions to research in medical literature.
    ATHLETE CONTEXT: {state["athlete_context"]}
    SYMPTON DESCRIPTION: {state["user_query"]}

    Generate the 2-4 most likely conditions. For each condition, provide:
     - "condition": the formal medical condition name ("lateral epicondylitis" instead of "elbow pain")
     - "search_terms: a PubMed query string using the quoted medical term plus rehabilitation qualifiers, fomatted like: "lateral epicondylitis" AND rehabilitation AND exercise
     - "likelihood": "high", "moderate", or "low" - informed by BOTH the symptoms and the athlete's sport/age/activity (a gripping sport makes forearm tendinopathies more likely)
     - "reasoning": a one sentence on why this fits

     Also include a top-level field "red_flags": true if the description mentions numbness, severe swelling, acute tramua, inability to bear weight, or symptoms suggesting they should see a doctor immediately. Otherwise false.
    
    Respond with ONLY a JSON object in this exact format, no markdown, no preamble:
    {{
        "red_flags": false,
        "differentials: [
            {{
                "condition": ...,
                "search_terms": ...,
                "likelihood": ...,
                "reasoning": ...,
            }}
        ]
    }}
    In search_terms, wrap medical phrases in single quotes, 
    not double quotes (e.g. 'lateral epicondylitis' AND rehabilitation AND exercise), 
    since your output must be valid JSON.
    """
    response = llm.messages.create(
        model="claude-sonnet-4-5",
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
    return {"diagnoses": parsed["differentials"], "red_flags": parsed["red_flags"]}

MIN_SCORE = 0.70
MIN_CHUNKS = 3
def evaluate_coverage_node(state: AgentState) -> dict:
    weak = []
    for dx in state["diagnoses"]:
        relevant = [
            r for r in state["search_results"]
            if r["diagnosis"] == dx["condition"] and r["score"] >= MIN_SCORE
        ]
        if len(relevant) < MIN_CHUNKS:
            weak.append(dx["condition"])
    return {"weak_diagnoses": weak}

# reingest for weak diagnoses

 # attempt 0: full query; attempt 1: drop trailing qualifiers, keep term + rehabilitation
def broaden_query(search_terms: str, attempt: int) -> str:
    parts = search_terms.split(" AND ")
    keep = max(2, len(parts) - attempt * 2)
    return " AND ".join(parts[:keep])

def ingest_node(state: AgentState) -> dict:
    attempt = state["ingest_attempts"]
    for dx in state["diagnoses"]:
        if dx["condition"] in state["weak_diagnoses"]:
            query = broaden_query(dx["search_terms"], attempt)
            pubmed_query = query.replace("'", '"')
            ingest(pubmed_query, max_papers=15)
    return {"ingest_attempts": attempt + 1}


def route_after_coverage(state: AgentState) -> str:
    if state["weak_diagnoses"] and state["ingest_attempts"] < 2:
        return "ingest"
    return "rerank"


# 3. Node: search
def search_node(state: AgentState) -> dict:
    client = get_client()
    all_results = []
    for dx in state["diagnoses"]:
        results = search(client, dx["search_terms"], limit=5)
        for r in results:
            r["diagnosis"] = dx["condition"]   # tag which differential it supports
        all_results.extend(results)
    return {"search_results": all_results}

def generate_report_node(state: AgentState) -> dict:
    evidence_blocks = []
    for dx in state["diagnoses"]:
        relevant = [r for r in state["search_results"] if r.get("diagnosis") == dx["condition"]]
        relevant = relevant[:5]  # top 5 per diagnosis after re-rank

        if not relevant:
            evidence_blocks.append(
                f"### {dx['condition']} ({dx['likelihood']} likelihood)\n"
                f"Reasoning: {dx['reasoning']}\n"
                f"Retrieved evidence: NONE FOUND\n"
            )
            continue

        papers_text = "\n".join([
            f"  - [PMID: {r['pmid']}] ({r.get('study_design', 'unknown')}, {r.get('year', 'n.d.')}, "
            f"population score {r.get('population_score', '?')}/5) "
            f"\"{r['title']}\"\n    Excerpt: {r['text'][:400]}"
            for r in relevant
        ])
        evidence_blocks.append(
            f"### {dx['condition']} ({dx['likelihood']} likelihood)\n"
            f"Reasoning: {dx['reasoning']}\n"
            f"Retrieved evidence:\n{papers_text}"
        )

    evidence_section = "\n\n".join(evidence_blocks)
    weak = ", ".join(state["weak_diagnoses"]) or "none"

    prompt = f"""You are a sports medicine evidence summarizer. Given a user's injury description and retrieved medical literature, write a structured report that helps them understand the likely conditions and what current research says about each.

USER DESCRIPTION:
{state["user_query"]}

ATHLETE CONTEXT:
{state["athlete_context"]}

RED FLAGS DETECTED: {state["red_flags"]}
WEAK COVERAGE DIAGNOSES (limited evidence retrieved): {weak}

RETRIEVED EVIDENCE BY DIAGNOSIS:
{evidence_section}

RULES (follow strictly):
1. You are NOT diagnosing. Phrase findings as "this fits the pattern of X" or "studies suggest..." — never "you have X."
2. Every clinical claim must end with a PMID citation in the format [PMID: 12345678]. If you cannot cite, do not claim.
3. If RED FLAGS DETECTED is True, the report MUST begin with a clear safety warning advising the user to see a clinician promptly, with brief reasoning, BEFORE any differential discussion.
4. For any condition listed in WEAK COVERAGE DIAGNOSES, begin that section with "Evidence specific to this condition was limited in the available sources."
5. Favor higher-tier evidence: systematic reviews and RCTs over case reports. When citing weaker evidence, say so (e.g., "a case report suggests...").
6. If two cited papers disagree, surface the disagreement explicitly: "Some evidence supports X [PMID: ...], while other studies challenge this [PMID: ...]."
7. Note population fit: if a population_score is low for an otherwise relevant study, mention that the study population may not match the user.

OUTPUT FORMAT (markdown, exactly these sections in this order):

# Possible Conditions Report

## ⚠️ Safety Note
(Only include this section if RED FLAGS DETECTED is True. Otherwise omit entirely.)

## Most Likely Conditions
For each diagnosis in order of likelihood:

### {{condition name}} ({{likelihood}})
What the evidence says: 2-4 sentences summarizing the strongest supporting evidence, with PMID citations.
Treatment approaches studied: bullet list of approaches with citations.
Caveats: any population mismatches, conflicting findings, or weak coverage notes.

## Limitations of This Report
Brief honest note about what the retrieved evidence does and doesn't cover.

## Suggested Next Steps
2-3 sentences of general next-step guidance (e.g., when to see a sports medicine physician, what to track). Do NOT prescribe specific exercises or treatments.

Write the report now."""

    response = llm.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=3000,
        messages=[{"role": "user", "content": prompt}],
    )
    return {"final_report": response.content[0].text}

def rerank_node(state: AgentState) -> dict:
    seen = {}
    for r in state["search_results"]:
        pmid = r["pmid"]
        if pmid not in seen or r["score"] > seen[pmid]["score"]:
            seen[pmid] = r
    ranked = rerank_by_population(list(seen.values()), state["athlete_context"])
    return {"search_results": ranked}

# 4. Wire the graph
def build_graph():
    g = StateGraph(AgentState)
    g.add_node("diagnose", diagnose_node)
    g.add_node("search", search_node)
    g.add_node("evaluate", evaluate_coverage_node)
    g.add_node("ingest", ingest_node)

    g.add_edge(START, "diagnose")
    g.add_edge("diagnose", "search")
    g.add_edge("search", "evaluate")
    g.add_node("rerank", rerank_node)
    g.add_conditional_edges("evaluate", route_after_coverage, {"ingest": "ingest", "rerank": "rerank"})
    g.add_node("final_report", generate_report_node)
    g.add_edge("rerank", "final_report")
    g.add_edge("final_report", END)
    g.add_edge("ingest", "search")    # the loop: re-search after ingesting
    return g.compile()

if __name__ == "__main__":
    graph = build_graph()

    test_cases = [
        {
            "user_query": "outside of my elbow hurts when I grip, started 6 weeks ago",
            "athlete_context": "28-year-old male, recreational rock climber, trains 4x/week",
        },
        {
            "user_query": "my shoulder feels weird when I throw, kind of a dull ache deep inside",
            "athlete_context": "21-year-old college baseball pitcher, throws 5x/week",
        },
        {
            "user_query": "knee swelled up badly after I landed weird, can't put weight on it",
            "athlete_context": "24-year-old female, club volleyball player",
        },
    ]
    
    
    for tc in test_cases:
        print("=" * 70)
        print(f"QUERY: {tc['user_query']}")
        print(f"CONTEXT: {tc['athlete_context']}")
        print("=" * 70)

        result = graph.invoke({
            **tc,
            "diagnoses": [],
            "search_results": [],
            "red_flags": False,
            "weak_diagnoses": [],
            "ingest_attempts": 0,
            "final_report": "",
        })

        print(result["final_report"])
        print("\n")

        DEBUG = False
        if DEBUG:
            print(f"RED FLAGS: {result['red_flags']}")
            print(f"INGEST ATTEMPTS: {result['ingest_attempts']}")
            print(f"WEAK DIAGNOSES: {result['weak_diagnoses']}")
            for r in result["search_results"][:5]:
                print(f"  [pop {r.get('population_score', '?')}] [{r['score']:.2f}] {r['title'][:60]}")
            print(f"FINAL REPORT: {result['final_report']}")
        