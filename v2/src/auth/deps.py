from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.sessions import load_session
from src.core.config import get_settings
from src.db.models import User
from src.db.session import get_session


async def current_user(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> User:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name, "")
    pair = await load_session(db, token) if token else None
    if not pair:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")
    return pair[0]
