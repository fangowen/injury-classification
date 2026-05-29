"""
injest papers for a given injury 
"""

import sys
from dotenv import load_dotenv
from .pubmed import search_pmids, fetch_papers
from .chunker import chunk_paper
from ..retrieval.store import get_client, init_collection, store_chunks

load_dotenv()

def ingest(query: str, max_papers: int = 30):
    print(f"Searching PubMed: {query}")
    pmids = search_pmids(query, max_results=max_papers)
    print(f"Found {len(pmids)} papers")

    papers = fetch_papers(pmids)
    print(f"Fetched {len(papers)} papers with abstracts")

    client = get_client()
    init_collection(client)

    total_chunks = 0
    for paper in papers:
        chunks = chunk_paper(paper)
        stored = store_chunks(client, chunks)
        total_chunks += stored
        print(f"  [{paper.pmid}] {paper.title[:60]}... → {stored} chunks")

    print(f"\nDone. Stored {total_chunks} chunks total.")


if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else '"lateral epicondylitis" AND rehabilitation AND exercise'
    ingest(query)