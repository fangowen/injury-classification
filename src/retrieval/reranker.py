# src/retrieval/reranker.py
# Uses Claude's API to rerank retrived chunks based on Population Relevance
import anthropic
import json
from dotenv import load_dotenv
import os
load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

def rerank_by_population(chunks: list[dict], athlete_context: str) -> list[dict]:
    """Rerank chunks based on population relevance"""
    if not chunks: return []

    reranked = []
    for chunk in chunks:
        score = _score_population_relevance(chunk, athlete_context)
        scored_chunk = {**chunk, "population_score": score["score"], "population_reason": score["reason"]}
        reranked.append(scored_chunk)

    #sort by population score descending
    reranked.sort(key=lambda x: (x["population_score"], x["score"]), reverse=True)
    seen = {}
    for r in reranked:
        pmid = r["pmid"]
        if pmid not in seen or r['score'] > seen[pmid]['score']:
            seen[pmid] = r
    
    return list(seen.values())

def _score_population_relevance(chunk: dict, athlete_context: str) -> dict:
    """Score population relevance for a chunk"""
    prompt = f"""You are evaluating whether a medical study is relevant to a specific patient.

PATIENT CONTEXT:
{athlete_context}

STUDY:
Title: {chunk.get('title', 'Unknown')}
Study design: {chunk.get('study_design', 'Unknown')}
Year: {chunk.get('year', 'Unknown')}
Text: {chunk.get('text', '')[:1000]}

Rate the population relevance from 1-5:
5 = Study population closely matches patient (same age range, activity level, sport type, injury mechanism)
4 = Good match with minor differences (similar sport, slightly different age)
3 = Moderate match (athletic population but different sport or age group)
2 = Weak match (general population or very different demographic)
1 = Poor match (elderly, sedentary, post-surgical, or pediatric when patient is an active adult)

Respond with ONLY a JSON object:
{{"score": <1-5>, "reason": "<one sentence explaining your rating>"}}"""
    
    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=150,
        messages=[{"role": "user", "content": prompt}],
    )

    try:
        text = response.content[0].text.strip()
        # Handle potential markdown wrapping
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(text)
    except (json.JSONDecodeError, IndexError):
        return {"score": 3, "reason": "Could not evaluate population relevance"}


# Quick test
if __name__ == "__main__":
    from .store import get_client, search

    client_qdrant = get_client()
    results = search(client_qdrant, "eccentric loading tendinopathy", limit=5)

    athlete = "28-year-old male, recreational rock climber, trains 4x/week, lateral elbow pain for 6 weeks"

    print(f"Re-ranking for: {athlete}\n")
    ranked = rerank_by_population(results, athlete)

    for i, r in enumerate(ranked, 1):
        print(f"{i}. [Pop score: {r['population_score']}] {r['title']}")
        print(f"   Reason: {r['population_reason']}")
        print(f"   Study design: {r['study_design']} | Semantic score: {r['score']:.3f}")
        print()