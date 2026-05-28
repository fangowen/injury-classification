from dataclasses import dataclass
from typing import Optional
from .pubmed import Paper, PaperSection


@dataclass
class Chunk:
    text: str
    metadata: dict

    def to_payload(self) -> dict:
        """ Return metadata dict for Qdrant """
        return self.metadata
    

def classify_study(paper: Paper) -> str:
        """Infer study design from publication types and Mesh terms"""
        pub_types = [pt.lower() for pt in paper.publication_types]
        mesh_terms = [mt.lower() for mt in paper.mesh_terms]

        if any("systematic review" in pt or "meta-analysis" in pt for pt in pub_types):
            return "Systematic Review"
        if any("randomized controlled trial" in pt or "randomized controll" in pt for pt in pub_types):
            return "Randomized Controlled Trial"
        if any("cohort" in pt or "observational" in pt for pt in pub_types):
            return "cohort"
        if any("case report" in pt or "case series" in pt for pt in pub_types):
            return "case report"
        if any("review" in pt for pt in pub_types):
            return "review"
        return "unknown"
    
def chunk_paper(paper: Paper) -> list[Chunk]:
        """Chunk a paper by abstract sections"""
        chunks = []
        study_design = classify_study(paper)
        for sec in paper.abstract_sections:
            if len(sec.text.split()) < 50:
                continue
            section_label = (sec.label or "").strip() or "abstract"
            
            metadata = {
                "pmid" : paper.pmid,
                "title" : paper.title,
                "year" : paper.year,
                "section" : section_label.lower(),
                "study_design" : study_design,
                "authors" : paper.authors[:5],
                "mesh_terms" : paper.mesh_terms,
                "publication_types" : paper.publication_types,
            }

            prefixed_text = (
                f"[{section_label}] from \"{paper.title}\" "
                f"({study_design.replace('_', ' ')}, {paper.year}): "
                f"{sec.text.strip()}"
            )
            chunks.append(Chunk(text=prefixed_text, metadata=metadata))
        
        if paper.abstract_sections:
            full_text = (
                f"\"{paper.title}\" ({study_design.replace('_', ' ')}, {paper.year}): "
                f"{paper.full_abstract.strip()}"
            )
            chunks.append(Chunk(text=full_text, metadata={
                "pmid": paper.pmid,
                "title": paper.title,
                "year": paper.year,
                "section": "full_abstract",
                "study_design": study_design,
                "authors": paper.authors[:5],
                "mesh_terms": paper.mesh_terms,
                "publication_types": paper.publication_types,
            }))
        return chunks


    #test
if __name__ == "__main__":
        from dotenv import load_dotenv
        from .pubmed import search_pmids, fetch_papers
        load_dotenv()

        pmids = search_pmids('"patellar tendinopathy" AND rehabilitation AND exercise', max_results=5)
        papers = fetch_papers(pmids)

        for paper in papers:
            chunks = chunk_paper(paper)
            print(f"\n{'='*60}")
            print(f"{paper.title}")
            print(f"Study design: {classify_study(paper)}")
            print(f"Chunks created: {len(chunks)}")
            for c in chunks:
                print(f"  [{c.metadata['section']}] {len(c.text)} chars")

