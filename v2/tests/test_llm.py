import pytest

from src.llm.base import ChatContext
from src.llm.mock import MockLLMProvider
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
