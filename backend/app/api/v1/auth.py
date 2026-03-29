"""Authentication endpoints using Beanie ODM."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
import sentry_sdk
from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr

from app.config import get_settings
from app.core.rate_limit import limiter
from app.db.models.app_settings import AppSettings
from app.db.models.user import User
from app.services.email_service import EmailService

# Fixed dev user ID so all debug-mode layers (REST, WebSocket) share
# the same identity and can find each other's data.
_DEV_USER_ID = PydanticObjectId("000000000000000000000000")

router = APIRouter()
settings = get_settings()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


class Token(BaseModel):
    access_token: str
    token_type: str
    expires_in: int | None = None  # seconds until expiry, None = no expiry


class TokenData(BaseModel):
    """Token payload data."""

    email: str | None = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    is_active: bool
    is_superuser: bool
    created_at: datetime

    class Config:
        from_attributes = True


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against hash."""
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def is_token_revoked_by_password_change(user: User, payload: dict) -> bool:
    """Check if a token was issued before the user's last password change."""
    if user.password_changed_at is None:
        return False
    iat = payload.get("iat")
    if iat is None:
        return False
    iat_dt = datetime.fromtimestamp(iat, tz=UTC)
    return iat_dt < user.password_changed_at


async def _get_effective_token_expire_minutes() -> int:
    """DB setting > env var > 0 (no expiry)."""
    app_settings = await AppSettings.get_instance()
    if app_settings.access_token_expire_minutes > 0:
        return app_settings.access_token_expire_minutes
    return settings.access_token_expire_minutes


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create JWT access token with iat claim."""
    to_encode = data.copy()
    to_encode["iat"] = datetime.now(UTC)
    if expires_delta is not None:
        expire = datetime.now(UTC) + expires_delta
        to_encode["exp"] = expire
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


async def _build_token_response(email: str) -> dict:
    """Create a token with the current effective expiry and return as Token dict."""
    expire_minutes = await _get_effective_token_expire_minutes()
    expires_delta = timedelta(minutes=expire_minutes) if expire_minutes > 0 else None
    access_token = create_access_token(data={"sub": email}, expires_delta=expires_delta)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": expire_minutes * 60 if expire_minutes > 0 else None,
    }


async def get_current_user(
    token: str = Depends(oauth2_scheme),
) -> User:
    """Get current user from JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email: str | None = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await User.find_one(User.email == email)
    if user is None:
        raise credentials_exception

    if is_token_revoked_by_password_change(user, payload):
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure user is active."""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    sentry_sdk.set_user({"id": str(current_user.id), "email": current_user.email})
    return current_user


async def get_dev_user() -> User:
    """Return a mock superuser for development mode (no JWT required).

    Uses a fixed _DEV_USER_ID so the same identity is shared across
    REST endpoints and WebSocket handlers, preventing user_id mismatches.
    """
    return User(
        id=_DEV_USER_ID,
        email="dev@localhost.dev",
        hashed_password="",
        full_name="Dev User",
        is_active=True,
        is_superuser=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@router.post("/register", response_model=UserResponse)
@limiter.limit("3/minute")
async def register(request: Request, user_data: UserCreate) -> dict:
    """Register a new user."""
    normalized_email = str(user_data.email).strip().lower()
    existing_user = await User.find_one(User.email == normalized_email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
    user = User(
        email=normalized_email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
    )
    await user.insert()

    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
        "created_at": user.created_at,
    }


@router.post("/token", response_model=Token)
@limiter.limit("5/minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> dict:
    """Authenticate user and return JWT token."""
    normalized_email = form_data.username.strip().lower()
    user = await User.find_one(User.email == normalized_email)

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return await _build_token_response(user.email)


@router.post("/refresh", response_model=Token)
@limiter.limit("10/minute")
async def refresh_token(
    request: Request,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Issue a new token from a valid current token."""
    return await _build_token_response(current_user.email)


@router.post("/change-password", response_model=Token)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Change password and return a new token. Invalidates all prior tokens."""
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.hashed_password = get_password_hash(body.new_password)
    current_user.password_changed_at = datetime.now(UTC)
    current_user.update_timestamp()
    await current_user.save()

    return await _build_token_response(current_user.email)


@router.get("/me", response_model=UserResponse)
async def read_users_me(
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Get current user info."""
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "is_active": current_user.is_active,
        "is_superuser": current_user.is_superuser,
        "created_at": current_user.created_at,
    }


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, body: ForgotPasswordRequest) -> dict:
    """Send a password-reset email. Always returns 200 to avoid leaking user existence."""
    normalized_email = str(body.email).strip().lower()
    user = await User.find_one(User.email == normalized_email)

    if user and user.is_active:
        token = secrets.token_urlsafe(32)
        user.reset_token_hash = hashlib.sha256(token.encode()).hexdigest()
        user.reset_token_expires = datetime.now(UTC) + timedelta(hours=1)
        user.update_timestamp()
        await user.save()

        email_service = EmailService()
        await email_service.send_password_reset(normalized_email, token)

    return {"message": "If an account exists with this email, you will receive a reset link."}


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, body: ResetPasswordRequest) -> dict:
    """Reset password using a valid token."""
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    user = await User.find_one(
        User.reset_token_hash == token_hash,
        User.reset_token_expires >= datetime.now(UTC),
    )

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user.hashed_password = get_password_hash(body.password)
    user.password_changed_at = datetime.now(UTC)
    user.reset_token_hash = None
    user.reset_token_expires = None
    user.update_timestamp()
    await user.save()

    return {"message": "Password has been reset successfully."}
