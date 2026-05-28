# src/ingestion/pubmed.py
# This filed is used to fetch and process data from using PubMeds free API.
# esearch will take a text query and return a list of PMIDs
# efetch will take a list of PMIDs and return the full paper data


import httpx
from lxml import etree
from dataclasses import dataclass, field
from typing import List, Optional
import time
import os

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

@dataclass
class PaperSection:
    label: str
    text: str

@dataclass
class Paper:
    pmid: str
    title:str
    abstract_sections: list[PaperSection]
    authors: list[str]
    year: Optional[str]
    mesh_terms: list[str] = field(default_factory=list)
    publication_types: list[str] = field(default_factory=list)

    @property
    def full_abstract(self) -> str:
        return "\n".join(section.text for section in self.abstract_sections)

def search_pmids(query: str, max_results: int = 50) -> list[str]:
    """Search PubMed for PMIDs matching the query."""

    params = {
        "db": "pubmed",
        "term": query,
        "retmax": max_results,
        "retmode": "json",
        "sort": "relevance",
    }
    api_key = os.getenv("NCBI_API_KEY")
    if api_key:
        params["api_key"] = api_key
    
    resp = httpx.get(ESEARCH_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data.get("esearchresult", {}).get("idlist", [])

def fetch_papers(pmids: list[str]) -> list[Paper]:
    """Fetch full paper data from PubMed for a list of PMIDs."""
    if not pmids: return []

    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
    }

    api_key = os.getenv("NCBI_API_KEY")
    if api_key:
        params["api_key"] = api_key
    
    resp = httpx.get(EFETCH_URL, params=params, timeout=60)
    resp.raise_for_status()
    root = etree.fromstring(resp.content)
    papers = []

    for article in root.xpath(".//PubmedArticle"):
        #PMIDS
        pmid_element = article.find(".//PMID")
        pmid=pmid_element.text if pmid_element is not None else "unknown"

        #Title
        title_element = article.find(".//ArticleTitle")
        title = title_element.text if title_element is not None else ""

        #authors
        authors = []
        for author in article.findall(".//Author"):
            last_name = author.findtext("LastName", "")
            first_name = author.findtext("ForeName","")
            if last_name:
                authors.append(f"{last_name}, {first_name}".strip())

        #Year

        year_element = article.find(".//PubDate/Year")
        year = year_element.text if year_element is not None else None

        #abstract sections
        sections = []
        for section in article.findall(".//AbstractText"):
            label = section.get("Label", "")
            text = "".join(section.itertext()).strip()
            if text:
                sections.append(PaperSection(label=label, text=text))
        
        #mesh terms
        mesh_terms = []
        for mesh in article.findall(".//MeshHeading/DescriptorName"):
            if mesh.text:
                mesh_terms.append(mesh.text.strip())
        
        #pub types

        pub_types = []
        for pt in article.findall(".//PublicationType"):
            if pt.text:
                pub_types.append(pt.text.strip())
        
        #create paper object
        papers.append(Paper(
            pmid=pmid,
            title=title,
            abstract_sections=sections,
            authors=authors,
            year=year,
            mesh_terms=mesh_terms,
            publication_types=pub_types,
        ))
    return papers

#TEST
if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    query = '"patellar tendinopathy" AND rehabilitation AND exercise'
    pmids = search_pmids(query, max_results=50)
    print(f"Found {len(pmids)} PMIDs")
    papers = fetch_papers(pmids)
    print(f"Fetched {len(papers)} papers")
    for paper in papers:
        print(f"PMID: {paper.pmid}")
        print(f"Title: {paper.title}")
        print(f"Abstract: {paper.full_abstract}")