from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.deps import current_user
from src.auth.passwords import verify_password
from src.auth.sessions import create_session, load_session, revoke_session
from src.core.config import get_settings
from src.db.models import User
from src.db.session import get_session

router = APIRouter()


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


def public_user(user: User) -> dict:
    return {"id": user.id, "username": user.username, "full_name": user.full_name, "role": user.role}


@router.post("/login")
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_session),
) -> dict:
    user = (await db.execute(select(User).where(User.username == body.username))).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    token, _ = await create_session(db, user.id)
    await db.commit()
    settings = get_settings()
    response.set_cookie(
        settings.session_cookie_name,
        token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.session_ttl_hours * 3600,
        path="/",
    )
    return {"user": public_user(user)}


@router.get("/me")
async def me(user: User = Depends(current_user)) -> dict:
    return {"user": public_user(user)}


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_session),
) -> dict:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name, "")
    pair = await load_session(db, token) if token else None
    if pair:
        await revoke_session(db, pair[1])
        await db.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")
    return {"ok": True}
