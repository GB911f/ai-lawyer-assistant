from dataclasses import dataclass
from typing import Any, Protocol

from src.core.config import get_settings
from src.legal_fts.searcher import LegalFTSSearcher
from src.rag.citations import Citation, from_legal_hits


class SafeTool(Protocol):
    name: str

    async def run(self, arguments: dict[str, Any]) -> list[Citation]: ...


@dataclass
class LegalCorpusTool:
    name: str = "search_legal_corpus"

    async def run(self, arguments: dict[str, Any]) -> list[Citation]:
        settings = get_settings()
        query = str(arguments.get("query", "")).strip()
        top_k = int(arguments.get("top_k", 5))
        hits = LegalFTSSearcher(settings.legal_fts_db_path).search(query, top_k=top_k)
        return from_legal_hits(hits)


@dataclass
class DemoWebSearchTool:
    name: str = "search_public_web"

    async def run(self, arguments: dict[str, Any]) -> list[Citation]:
        query = str(arguments.get("query", "правовой вопрос")).strip()
        return [
            Citation(
                document_name="Демонстрационный веб-источник",
                document_type="web",
                file_path="",
                chunk_text=f"Синтетический результат веб-поиска по запросу: {query}",
                cited_text="Проверяйте дату публикации и первоисточник правовой информации.",
                relevance_score=0.75,
                url="https://example.com/legal-source",
            )
        ]


class ToolRegistry:
    def __init__(self) -> None:
        tools: list[SafeTool] = [LegalCorpusTool(), DemoWebSearchTool()]
        self._tools = {tool.name: tool for tool in tools}

    async def run(self, name: str, arguments: dict[str, Any]) -> list[Citation]:
        tool = self._tools.get(name)
        if tool is None:
            raise ValueError(f"Tool is not allow-listed: {name}")
        return await tool.run(arguments)
