"""
Test the Qdrant Retrival system
"""

from dotenv import load_dotenv
from .store import get_client, search
load_dotenv()

def test():
    client = get_client()

    print("Rehab Evidence Search Test")
    
    while True:
        query = input("\nEnter your search query (or 'exit' to quit): ")
        if query.lower() == "exit":
            break

        results = search(client, query, limit=5)
        print(f"\nTop 5 results for: {query}")
        for r in results:
            print(f"\nScore: {r['score']:.2f}")
            print(f"Text: {r['text'][:100]}...")
            print(f"PMID: {r['pmid']}")
            print(f"Section: {r['section']}")
            print(f"Title: {r['title']}")
            print("-"*50)
        
        filtered = search(client, query, limit=5, section_filter=["results","conclusions"])
        print(f"\nTop 5 results for: {query} (filtered to Results and Conclusions)")
        for r in filtered:
            print(f"\nScore: {r['score']:.2f}")
            print(f"Text: {r['text'][:100]}...")
            print(f"PMID: {r['pmid']}")
            print(f"Section: {r['section']}")
            print(f"Title: {r['title']}")
            print("-"*50)
        
        print()

if __name__ == "__main__":
    test()