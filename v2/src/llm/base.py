from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from src.rag.citations import Citation


@dataclass(frozen=True)
class ChatContext:
    question: str
    history: list[dict[str, str]] = field(default_factory=list)
    citations: list[Citation] = field(default_factory=list)


class LLMProvider(ABC):
    @abstractmethod
    async def stream(self, context: ChatContext) -> AsyncIterator[str]:
        raise NotImplementedError
