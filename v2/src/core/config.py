from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    log_level: str = "INFO"

    database_url: str = "sqlite+aiosqlite:///./data/demo/jarvis.db"
    session_cookie_name: str = "jarvis_session"
    session_ttl_hours: int = 24
    demo_username: str = "demo"
    demo_password: str = "demo"

    llm_provider: str = "mock"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    legal_corpus_dir: Path = Path("./data/demo/legal_corpus")
    legal_fts_db_path: Path = Path("./data/indexes/legal_fts.sqlite3")
    upload_dir: Path = Path("./data/uploads")
    generated_dir: Path = Path("./data/generated")

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
