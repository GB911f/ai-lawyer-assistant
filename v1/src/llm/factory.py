from functools import lru_cache

from src.core.config import get_settings
from src.llm.base import LLMProvider
from src.llm.mock import MockLLMProvider
from src.llm.ollama_provider import OllamaProvider


@lru_cache(maxsize=1)
def get_llm_provider() -> LLMProvider:
    settings = get_settings()
    provider = settings.llm_provider.lower().strip()
    if provider == "mock":
        return MockLLMProvider()
    if provider == "ollama":
        return OllamaProvider(
            host=settings.ollama_host,
            model=settings.ollama_chat_model,
            timeout_seconds=settings.ollama_timeout_seconds,
            context_window=settings.ollama_context_window,
            temperature=settings.ollama_temperature,
        )
    raise ValueError(f"Unsupported LLM_PROVIDER: {settings.llm_provider}")
