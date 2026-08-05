from contextlib import asynccontextmanager
from importlib import import_module

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from src.api.middleware import SecurityHeadersMiddleware
from src.api.routers import auth, chat, health, knowledge
from src.auth.passwords import hash_password
from src.core.config import get_settings
from src.db.models import Base, User
from src.db.session import SessionLocal, engine
from src.legal_fts.indexer import LegalFTSIndexer


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.generated_dir.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        existing = (
            await db.execute(select(User).where(User.username == settings.demo_username))
        ).scalar_one_or_none()
        if existing is None:
            db.add(
                User(
                    username=settings.demo_username,
                    full_name="Демо-пользователь",
                    password_hash=hash_password(settings.demo_password),
                    role="admin",
                )
            )
            await db.commit()
    if not settings.legal_fts_db_path.exists() and settings.legal_corpus_dir.exists():
        LegalFTSIndexer(settings.legal_fts_db_path).build(settings.legal_corpus_dir)
    yield
    await engine.dispose()


app = FastAPI(
    title="Jarvis Legal Agent — Portfolio Edition",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(knowledge.router, prefix="/index", tags=["knowledge"])
app.include_router(health.router, tags=["service"])

# Product routers are contributed by Participant B. Dynamic loading keeps Part A runnable alone.
for module_name, prefix, tag in (
    ("src.api.routers.documents", "/documents", "documents"),
    ("src.api.routers.templates", "/templates", "templates"),
):
    try:
        module = import_module(module_name)
    except ModuleNotFoundError:
        continue
    app.include_router(module.router, prefix=prefix, tags=[tag])
