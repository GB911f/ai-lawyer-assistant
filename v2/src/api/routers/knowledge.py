from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from src.auth.deps import current_user
from src.core.config import get_settings
from src.db.models import User
from src.legal_fts.searcher import LegalFTSSearcher
from src.rag.citations import from_legal_hits

router = APIRouter()


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    top_k: int = Field(default=5, ge=1, le=20)


@router.get("/status")
async def status(user: User = Depends(current_user)) -> dict:
    settings = get_settings()
    searcher = LegalFTSSearcher(settings.legal_fts_db_path)
    return {"total_documents": searcher.count(), "index_ready": searcher.is_ready()}


@router.post("/search")
async def search(body: SearchRequest, user: User = Depends(current_user)) -> dict:
    settings = get_settings()
    hits = LegalFTSSearcher(settings.legal_fts_db_path).search(body.query, body.top_k)
    return {"query": body.query, "hits": [citation.as_dict() for citation in from_legal_hits(hits)]}
