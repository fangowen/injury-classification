from typing import TypedDict
from langgraph.graph import StateGraph, START, END
import anthropic
import json
from dotenv import load_dotenv

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
from ..ingestion.pipeline import ingest  

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
    g.add_conditional_edges("evaluate", route_after_coverage, {"ingest": "ingest", "rerank": END})
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
        result = graph.invoke({
            **tc,
            "diagnoses": [],
            "search_results": [],
            "red_flags": False,
            "ingest_attempts": 0,
            "weak_diagnoses": [],
        })
        print(f"RED FLAGS: {result['red_flags']}")
        print("DIFFERENTIALS:")
        for dx in result["diagnoses"]:
            print(f"  [{dx['likelihood']}] {dx['condition']}")
            print(f"      search: {dx['search_terms']}")
            print(f"      why: {dx['reasoning']}")
        print(f"RETRIEVED: {len(result['search_results'])} chunks")
        print(f"INGEST ATTEMPTS: {result['ingest_attempts']}")
        print(f"WEAK DIAGNOSES AFTER FINAL PASS: {result['weak_diagnoses']}")
        for r in result["search_results"][:5]:
            print(f"  [{r['score']:.2f}] [{r['diagnosis']}] {r['title'][:60]}")