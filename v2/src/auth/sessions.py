import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import get_settings
from src.db.models import AuthSession, User


def _now() -> datetime:
    return datetime.now(UTC)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def create_session(db: AsyncSession, user_id: int) -> tuple[str, AuthSession]:
    settings = get_settings()
    token = secrets.token_urlsafe(32)
    row = AuthSession(
        user_id=user_id,
        token_hash=_hash_token(token),
        expires_at=_now() + timedelta(hours=settings.session_ttl_hours),
    )
    db.add(row)
    await db.flush()
    return token, row


async def load_session(db: AsyncSession, token: str) -> tuple[User, AuthSession] | None:
    stmt = (
        select(User, AuthSession)
        .join(AuthSession, AuthSession.user_id == User.id)
        .where(AuthSession.token_hash == _hash_token(token))
    )
    pair = (await db.execute(stmt)).first()
    if not pair:
        return None
    user, auth_session = pair
    expires_at = auth_session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if auth_session.revoked_at is not None or expires_at <= _now() or not user.is_active:
        return None
    return user, auth_session


async def revoke_session(db: AsyncSession, auth_session: AuthSession) -> None:
    auth_session.revoked_at = _now()
    await db.flush()
