import json
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from src.auth.deps import current_user
from src.core.config import get_settings
from src.db.models import User
from src.docgen.batch import generate_batch
from src.indexer.models import ParsedDocument
from src.indexer.ocr.qwen_vl import QwenVLOCR
from src.indexer.parsers import parse_file
from src.llm.base import ChatContext
from src.llm.factory import get_llm_provider

router = APIRouter()


def parse_document(path: Path) -> ParsedDocument:
    suffix = path.suffix.lower()
    if suffix not in {".pdf", ".png", ".jpg", ".jpeg"}:
        return parse_file(path)
    settings = get_settings()
    ocr = QwenVLOCR(
        host=settings.ollama_host,
        model=settings.ollama_vision_model,
        timeout_seconds=settings.ollama_timeout_seconds,
    )
    return parse_file(path, ocr=ocr)


async def analyze_with_qwen(document_text: str, *, short: bool) -> str:
    instruction = (
        "Сделай краткое структурированное саммари документа: тип, стороны, суть, суммы, сроки и риски."
        if short
        else "Проведи глубокий юридический анализ документа: предмет, обязанности, сроки, ответственность, риски и рекомендации."
    )
    question = f"{instruction}\n\nТЕКСТ ДОКУМЕНТА:\n{document_text[:30_000]}"
    chunks = [
        chunk
        async for chunk in get_llm_provider().stream(
            ChatContext(question=question),
        )
    ]
    return "".join(chunks).strip()


class DocumentInfo(BaseModel):
    id: str
    name: str
    type: str
    file_path: str
    size_bytes: int


def demo_documents_root() -> Path:
    return Path("data/demo/documents").resolve()


def safe_demo_path(raw_path: str) -> Path:
    path = Path(raw_path).resolve()
    root = demo_documents_root()
    if path != root and root not in path.parents:
        raise HTTPException(status_code=403, detail="path_outside_demo_root")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="document_not_found")
    return path


@router.get("/", response_model=list[DocumentInfo])
async def documents(user: User = Depends(current_user)) -> list[DocumentInfo]:
    root = demo_documents_root()
    if not root.exists():
        return []
    result: list[DocumentInfo] = []
    for index, path in enumerate(sorted(item for item in root.rglob("*") if item.is_file()), 1):
        result.append(
            DocumentInfo(
                id=f"demo-{index}",
                name=path.name,
                type=path.parent.name,
                file_path=str(path),
                size_bytes=path.stat().st_size,
            )
        )
    return result


@router.get("/content")
async def content(path: str = Query(...), user: User = Depends(current_user)) -> dict:
    document_path = safe_demo_path(path)
    parsed = parse_document(document_path)
    return {
        "title": document_path.stem.replace("_", " "),
        "file_name": document_path.name,
        "document_type": document_path.parent.name,
        "content": parsed.text,
        "file_path": str(document_path),
        "is_html": False,
    }


@router.get("/download")
async def download(path: str = Query(...), user: User = Depends(current_user)) -> Response:
    document_path = safe_demo_path(path)
    return Response(
        document_path.read_bytes(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{document_path.name}"'},
    )


@router.get("/summary/stats")
async def summary_stats(user: User = Depends(current_user)) -> dict:
    total = len([path for path in demo_documents_root().rglob("*") if path.is_file()]) if demo_documents_root().exists() else 0
    return {"total": total, "done": total, "pending": 0, "running": 0, "failed": 0, "skipped": 0, "not_started": 0}


@router.get("/summary")
@router.post("/summary/enqueue")
async def document_summary(path: str = Query(...), user: User = Depends(current_user)) -> dict:
    document_path = safe_demo_path(path)
    parsed = parse_document(document_path)
    summary = await analyze_with_qwen(parsed.text, short=True)
    return {
        "file_path": str(document_path),
        "summary": summary,
        "model": get_settings().ollama_chat_model,
        "status": "done",
        "analyzed_at": None,
        "error": None,
    }


@router.post("/summary/enqueue-all")
async def enqueue_all(user: User = Depends(current_user)) -> dict:
    total = len([path for path in demo_documents_root().rglob("*") if path.is_file()]) if demo_documents_root().exists() else 0
    return {"enqueued": 0, "total_candidates": total}


@router.post("/deep-analyze/stream")
async def deep_analyze(path: str = Query(...), user: User = Depends(current_user)) -> EventSourceResponse:
    document_path = safe_demo_path(path)
    parsed = parse_document(document_path)

    async def events():
        yield {"event": "tool_start", "data": json.dumps({"name": "Read"}, ensure_ascii=False)}
        yield {"event": "tool_end", "data": json.dumps({"name": "Read"}, ensure_ascii=False)}
        question = (
            "Проведи глубокий юридический анализ документа: предмет, обязанности, сроки, "
            "ответственность, риски и рекомендации. Не выдумывай отсутствующие условия.\n\n"
            f"ТЕКСТ ДОКУМЕНТА:\n{parsed.text[:30_000]}"
        )
        async for chunk in get_llm_provider().stream(ChatContext(question=question)):
            yield {"event": "text", "data": json.dumps({"delta": chunk}, ensure_ascii=False)}
        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(events())


@router.post("/analyze-upload")
async def analyze_upload(
    file: Annotated[UploadFile, File(...)],
    user: User = Depends(current_user),
) -> dict:
    suffix = Path(file.filename or "document.txt").suffix or ".txt"
    with TemporaryDirectory() as directory:
        path = Path(directory) / f"upload{suffix}"
        path.write_bytes(await file.read())
        parsed = parse_document(path)
        answer = await analyze_with_qwen(parsed.text, short=False)
    return {
        "file_name": file.filename,
        "document_text": parsed.text,
        "answer": answer,
        "citations": [],
    }


@router.post("/batch-generate")
async def batch_generate(
    template_docx: UploadFile = File(...),
    companies_json: str = Form(...),
    user: User = Depends(current_user),
) -> Response:
    try:
        jobs = json.loads(companies_json)
        if not isinstance(jobs, list):
            raise ValueError("companies_json must be a list")
    except (json.JSONDecodeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    archive = generate_batch(await template_docx.read(), jobs)
    return Response(
        archive,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=jarvis-demo-batch.zip"},
    )
