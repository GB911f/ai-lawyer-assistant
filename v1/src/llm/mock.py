import asyncio
from collections.abc import AsyncIterator

from src.llm.base import ChatContext, LLMProvider


class MockLLMProvider(LLMProvider):
    async def stream(self, context: ChatContext) -> AsyncIterator[str]:
        source_note = (
            f"Найдено источников: **{len(context.citations)}**."
            if context.citations
            else "Релевантные источники в демо-корпусе не найдены."
        )
        answer = (
            "## Коротко\n\n"
            "Проверьте предмет, сроки, порядок приёмки и ответственность сторон. "
            "Для юридически значимого решения нужен контроль актуальности норм и ручная проверка.\n\n"
            "## Что сделать\n\n"
            "- зафиксировать событие, от которого исчисляется срок;\n"
            "- установить порядок мотивированных замечаний;\n"
            "- согласовать симметричную ответственность;\n"
            "- сохранить доказательства направления уведомлений.\n\n"
            f"{source_note}\n\n"
            "*Ответ сформирован безопасным mock-провайдером на синтетических данных.*"
        )
        for start in range(0, len(answer), 48):
            await asyncio.sleep(0)
            yield answer[start : start + 48]
