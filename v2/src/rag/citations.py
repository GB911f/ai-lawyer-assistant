from dataclasses import asdict, dataclass

from src.legal_fts.types import LegalSearchHit


@dataclass(frozen=True)
class Citation:
    document_name: str
    document_type: str
    file_path: str
    chunk_text: str
    cited_text: str
    relevance_score: float
    url: str | None = None

    def as_dict(self) -> dict:
        return asdict(self)


def from_legal_hits(hits: list[LegalSearchHit]) -> list[Citation]:
    return [
        Citation(
            document_name=hit.title,
            document_type="legal",
            file_path=hit.path,
            chunk_text=hit.text,
            cited_text=hit.text.replace("<mark>", "").replace("</mark>", ""),
            relevance_score=hit.score,
        )
        for hit in hits
    ]
