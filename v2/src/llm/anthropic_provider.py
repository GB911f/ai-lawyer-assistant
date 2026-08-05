from collections.abc import AsyncIterator

from src.llm.base import ChatContext, LLMProvider


class AnthropicAPIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is required for the anthropic provider")
        from anthropic import AsyncAnthropic

        self.client = AsyncAnthropic(api_key=api_key)
        self.model = model

    async def stream(self, context: ChatContext) -> AsyncIterator[str]:
        sources = "\n\n".join(
            f"SOURCE {index}: {citation.document_name}\n{citation.cited_text}"
            for index, citation in enumerate(context.citations, 1)
        )
        user_content = context.question
        if sources:
            user_content += "\n\nИспользуй только эти источники и явно отмечай неопределённость:\n" + sources
        async with self.client.messages.stream(
            model=self.model,
            max_tokens=1600,
            temperature=0.1,
            system=(
                "Ты юридический исследователь. Не выдумывай нормы и реквизиты. "
                "Ответ является черновиком и требует проверки юристом."
            ),
            messages=[{"role": "user", "content": user_content}],
        ) as stream:
            async for text in stream.text_stream:
                yield text
