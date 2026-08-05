import json

import httpx
import pytest

from src.llm.base import ChatContext
from src.llm.mock import MockLLMProvider
from src.llm.ollama_provider import OllamaProvider
from src.llm.tools import ToolRegistry


@pytest.mark.asyncio
async def test_mock_provider_streams_complete_answer() -> None:
    chunks = [chunk async for chunk in MockLLMProvider().stream(ChatContext(question="Риски?"))]
    answer = "".join(chunks)
    assert "## Коротко" in answer
    assert "mock-провайдером" in answer


@pytest.mark.asyncio
async def test_registry_rejects_unknown_tools() -> None:
    with pytest.raises(ValueError, match="not allow-listed"):
        await ToolRegistry().run("Bash", {})


@pytest.mark.asyncio
async def test_qwen_provider_streams_ollama_chat_response() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert request.url.path == "/api/chat"
        assert body["model"] == "qwen3:14b"
        content = (
            json.dumps({"message": {"content": "Первая часть. "}})
            + "\n"
            + json.dumps({"message": {"content": "Вторая часть."}, "done": True})
            + "\n"
        )
        return httpx.Response(200, content=content.encode("utf-8"))

    provider = OllamaProvider(
        "http://ollama.test",
        "qwen3:14b",
        transport=httpx.MockTransport(handler),
    )
    chunks = [chunk async for chunk in provider.stream(ChatContext(question="Проверь договор"))]
    assert "".join(chunks) == "Первая часть. Вторая часть."
