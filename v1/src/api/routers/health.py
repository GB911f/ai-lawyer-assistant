from fastapi import APIRouter

from src.core.config import get_settings
from src.legal_fts.searcher import LegalFTSSearcher

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    settings = get_settings()
    searcher = LegalFTSSearcher(settings.legal_fts_db_path)
    return {
        "status": "ok",
        "environment": settings.app_env,
        "llm_provider": settings.llm_provider,
        "legal_index_ready": searcher.is_ready(),
    }
