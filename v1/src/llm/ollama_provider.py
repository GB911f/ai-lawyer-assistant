import json
from collections.abc import AsyncIterator

import httpx

from src.llm.base import ChatContext, LLMProvider


class OllamaProvider(LLMProvider):
    """Streaming Qwen provider over Ollama's local HTTP API."""

    def __init__(
        self,
        host: str,
        model: str,
        *,
        timeout_seconds: float = 900.0,
        context_window: int = 32768,
        temperature: float = 0.15,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.host = host.rstrip("/")
        self.model = model
        self.timeout = httpx.Timeout(timeout_seconds)
        self.context_window = context_window
        self.temperature = temperature
        self.transport = transport

    @staticmethod
    def _system_prompt() -> str:
        return (
            "Ты юридический исследователь. Отвечай только по-русски. "
            "Не выдумывай нормы, судебные дела, реквизиты и содержание источников. "
            "Если данных недостаточно, явно сообщи об этом. Каждый ответ является "
            "черновиком и требует проверки квалифицированным юристом."
        )

    @staticmethod
    def _source_context(context: ChatContext) -> str:
        if not context.citations:
            return ""
        blocks = []
        for index, citation in enumerate(context.citations, 1):
            blocks.append(
                f"ИСТОЧНИК {index}: {citation.document_name}\n"
                f"Тип: {citation.document_type}\n"
                f"Фрагмент: {citation.cited_text or citation.chunk_text}"
            )
        return "\n\n".join(blocks)

    def _messages(self, context: ChatContext) -> list[dict[str, str]]:
        messages = [{"role": "system", "content": self._system_prompt()}]
        for item in context.history[-12:]:
            role = str(item.get("role", ""))
            content = str(item.get("content", "")).strip()
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content})
        question = context.question
        sources = self._source_context(context)
        if sources:
            question += (
                "\n\nНиже приведены найденные источники. Основывай выводы на них и "
                "указывай номера источников в квадратных скобках.\n\n" + sources
            )
        messages.append({"role": "user", "content": question})
        return messages

    async def stream(self, context: ChatContext) -> AsyncIterator[str]:
        payload = {
            "model": self.model,
            "messages": self._messages(context),
            "stream": True,
            "options": {
                "temperature": self.temperature,
                "num_ctx": self.context_window,
                "repeat_penalty": 1.05,
            },
        }
        emitted = False
        async with httpx.AsyncClient(timeout=self.timeout, transport=self.transport) as client:
            async with client.stream("POST", f"{self.host}/api/chat", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    item = json.loads(line)
                    if item.get("error"):
                        raise RuntimeError(f"Ollama error: {item['error']}")
                    content = str((item.get("message") or {}).get("content", ""))
                    if content:
                        emitted = True
                        yield content
        if not emitted:
            raise RuntimeError("Ollama returned an empty response")
