from functools import lru_cache

from src.core.config import get_settings
from src.llm.anthropic_provider import AnthropicAPIProvider
from src.llm.base import LLMProvider
from src.llm.mock import MockLLMProvider


@lru_cache(maxsize=1)
def get_llm_provider() -> LLMProvider:
    settings = get_settings()
    provider = settings.llm_provider.lower().strip()
    if provider == "mock":
        return MockLLMProvider()
    if provider == "anthropic":
        return AnthropicAPIProvider(settings.anthropic_api_key, settings.anthropic_model)
    raise ValueError(f"Unsupported LLM_PROVIDER: {settings.llm_provider}")
