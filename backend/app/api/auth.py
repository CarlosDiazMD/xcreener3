"""
Auth API for Xcreener 2.0

JWT-based authentication: register, login, user profile management.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.db_models import User
from app.models.schemas import (
    UserCreate, UserLogin, UserResponse, TokenResponse, UserUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: int, username: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "exp": datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = None,
) -> User:
    """Dependency to get the current authenticated user. Token comes from header."""
    # This is a simplified version; the actual token extraction is in middleware
    raise HTTPException(status_code=401, detail="Not implemented directly")


# FastAPI dependency for token extraction from Authorization header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()


async def get_user_from_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate JWT token, return the user."""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = int(payload.get("sub"))
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    return user


@router.post("/register", response_model=TokenResponse)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Register a new user."""
    # Check existing
    existing = await db.execute(
        select(User).where(
            (User.email == data.email) | (User.username == data.username)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email or username already exists")

    user = User(
        email=data.email,
        username=data.username,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    await db.flush()

    token = create_access_token(user.id, user.username)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    """Login with username/password."""
    result = await db.execute(
        select(User).where(User.username == data.username)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    user.last_login = datetime.utcnow()
    token = create_access_token(user.id, user.username)

    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_profile(user: User = Depends(get_user_from_token)):
    """Get current user profile."""
    return UserResponse.model_validate(user)


@router.patch("/me", response_model=UserResponse)
async def update_profile(
    data: UserUpdate,
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Update user profile / preferences."""
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    return UserResponse.model_validate(user)


@router.post("/test-telegram")
async def test_telegram(user: User = Depends(get_user_from_token)):
    """Send a test message to the user's Telegram."""
    if not user.telegram_chat_id:
        raise HTTPException(
            status_code=400,
            detail="No Telegram Chat ID configured. Go to Settings and save your Chat ID first.",
        )

    from app.services.alerts import alert_service
    success, error = await alert_service.send_test_message(user.telegram_chat_id)

    if success:
        return {"status": "ok", "message": "Test message sent"}
    else:
        raise HTTPException(status_code=400, detail=error or "Failed to send test message")
