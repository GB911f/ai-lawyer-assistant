import json
from typing import Any

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from src.auth.deps import current_user
from src.db.models import User
from src.llm.base import ChatContext
from src.llm.factory import get_llm_provider
from src.llm.tools import ToolRegistry
from src.rag.citations import Citation

router = APIRouter()


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10_000)
    history: list[dict[str, str]] = []
    use_kp: bool = False
    use_web: bool = False
    chat_id: str | None = None


def event(name: str, payload: dict[str, Any]) -> dict[str, str]:
    return {"event": name, "data": json.dumps(payload, ensure_ascii=False)}


async def stream_response(body: ChatRequest):
    registry = ToolRegistry()
    citations: list[Citation] = []
    if body.use_kp:
        tool_name = "search_legal_corpus"
        yield event("tool_start", {"name": tool_name})
        citations.extend(await registry.run(tool_name, {"query": body.message, "top_k": 5}))
        yield event("tool_end", {"name": tool_name})
    if body.use_web:
        tool_name = "search_public_web"
        yield event("tool_start", {"name": tool_name})
        citations.extend(await registry.run(tool_name, {"query": body.message}))
        yield event("tool_end", {"name": tool_name})

    provider = get_llm_provider()
    context = ChatContext(question=body.message, history=body.history, citations=citations)
    async for chunk in provider.stream(context):
        yield event("text", {"delta": chunk})
    items = [citation.as_dict() for citation in citations]
    if items:
        yield event("citations", {"items": items})
    yield event("done", {"citations": items})


@router.post("/direct/stream")
async def direct_stream(
    body: ChatRequest,
    user: User = Depends(current_user),
) -> EventSourceResponse:
    return EventSourceResponse(stream_response(body))


@router.post("/with-files/stream")
async def with_files_stream(
    message: str = Form(...),
    history: str = Form("[]"),
    use_kp: bool = Form(False),
    use_web: bool = Form(False),
    chat_id: str | None = Form(None),
    files: list[UploadFile] = File(default=[]),
    user: User = Depends(current_user),
) -> EventSourceResponse:
    try:
        parsed_history = json.loads(history)
    except json.JSONDecodeError:
        parsed_history = []
    attachment_note = ""
    if files:
        attachment_note = "\n\nПрикреплены файлы: " + ", ".join(file.filename or "document" for file in files)
    body = ChatRequest(
        message=message + attachment_note,
        history=parsed_history,
        use_kp=use_kp,
        use_web=use_web,
        chat_id=chat_id,
    )
    return EventSourceResponse(stream_response(body))
