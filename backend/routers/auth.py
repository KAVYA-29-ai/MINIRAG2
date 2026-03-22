
"""
Authentication Router for MINI-RAG Backend

Handles user registration, login, JWT token management, and authentication-related endpoints.
All user data is stored in Supabase.
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
import os
from urllib.parse import urlencode
from dotenv import load_dotenv
from pydantic import BaseModel, EmailStr

from models import UserRegister, UserLogin, Token
from database import get_supabase
from core.rate_limit import limiter

load_dotenv()

router = APIRouter()
security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
EMAIL_VERIFICATION_REQUIRED = os.getenv("REQUIRE_EMAIL_VERIFICATION", "false").lower() in {"1", "true", "yes"}
EMAIL_VERIFICATION_EXPIRE_HOURS = int(os.getenv("EMAIL_VERIFICATION_EXPIRE_HOURS", "24"))
AUTH_RATE_LIMIT = os.getenv("AUTH_RATE_LIMIT", "5/minute")

# Temporary product decision: keep verification OFF until resend flow is implemented.
EMAIL_VERIFICATION_REQUIRED = False

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is required. Set it in your environment or .env file.")


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against its hashed version.
    Returns True if the password matches, False otherwise.
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    Hash a plain password using bcrypt.
    Returns the hashed password string.
    """
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """
    Create a JWT access token with the given data and expiration delta.
    Returns the encoded JWT token as a string.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Decode JWT and fetch the user row from Supabase.
    Returns the user dictionary or raises HTTPException if invalid.
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: int = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")

        sb = get_supabase()
        resp = sb.table("users").select("*").eq("id", user_id).limit(1).execute()
        user = resp.data[0] if resp.data else None
        if user:
            return {
                "id": user["id"],
                "name": user["name"],
                "institution_id": user["institution_id"],
                "email": user.get("email") or "",
                "role": user["role"],
                "avatar": user.get("avatar", "male"),
                "status": user.get("status", "active"),
            }
        return {
            "id": user_id,
            "institution_id": payload.get("institution_id", ""),
            "role": payload.get("role", "student"),
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_role(allowed_roles: list):
    """
    Dependency generator to require a user to have one of the allowed roles.
    Returns a dependency function for FastAPI routes.
    """
    async def check_role(user: dict = Depends(get_current_user)):
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return check_role


def create_email_verification_token(user_id: int, email: str) -> str:
    """Create a short-lived token used by the email verification endpoint."""
    expires_at = datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFICATION_EXPIRE_HOURS)
    payload = {
        "user_id": user_id,
        "email": email,
        "token_type": "email_verification",
        "exp": expires_at,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


@router.post("/register", response_model=Token)
@limiter.limit(AUTH_RATE_LIMIT)
async def register(request: Request, user_data: UserRegister):
    """
    Register a new user and store their data in Supabase.
    Returns a JWT token and user info on success.
    """
    try:
        sb = get_supabase()
        existing = sb.table("users").select("id").eq("institution_id", user_data.institution_id).limit(1).execute()
        if existing.data and len(existing.data) > 0:
            raise HTTPException(status_code=400, detail="User with this Institution ID already exists")

        hashed_password = get_password_hash(user_data.password)
        initial_status = "pending_verification" if (EMAIL_VERIFICATION_REQUIRED and user_data.email) else "active"
        row = {
            "name": user_data.name,
            "institution_id": user_data.institution_id,
            "email": user_data.email or "",
            "password_hash": hashed_password,
            "role": user_data.role.value,
            "avatar": user_data.avatar,
            "status": initial_status,
        }
        resp = sb.table("users").insert(row).execute()
        new_user = resp.data[0]

        if EMAIL_VERIFICATION_REQUIRED and (new_user.get("email") or ""):
            verification_token = create_email_verification_token(new_user["id"], new_user.get("email") or "")
            return Token(
                access_token="",
                token_type="bearer",
                user={
                    "id": new_user["id"],
                    "name": new_user["name"],
                    "institution_id": new_user["institution_id"],
                    "email": new_user.get("email") or "",
                    "role": new_user["role"],
                    "avatar": new_user.get("avatar", "male"),
                    "status": new_user.get("status", "pending_verification"),
                },
                requires_verification=True,
                message=(
                    "Email verification required. Open /api/auth/verify-email?token="
                    f"{verification_token}"
                ),
            )

        access_token = create_access_token({
            "user_id": new_user["id"],
            "institution_id": new_user["institution_id"],
            "role": new_user["role"],
        })
        return Token(
            access_token=access_token,
            token_type="bearer",
            user={
                "id": new_user["id"],
                "name": new_user["name"],
                "institution_id": new_user["institution_id"],
                "email": new_user.get("email") or "",
                "role": new_user["role"],
                "avatar": new_user.get("avatar", "male"),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/login", response_model=Token)
@limiter.limit(AUTH_RATE_LIMIT)
async def login(request: Request, user_data: UserLogin):
    """
    Login a user by verifying credentials against the Supabase users table.
    Returns a JWT token and user info on success.
    """
    try:
        sb = get_supabase()
        resp = sb.table("users").select("*").eq("institution_id", user_data.institution_id).limit(1).execute()
        user = resp.data[0] if resp.data else None
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if user.get("status") == "pending_verification":
            raise HTTPException(status_code=403, detail="Please verify your email before login")
        if not verify_password(user_data.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        access_token = create_access_token({
            "user_id": user["id"],
            "institution_id": user["institution_id"],
            "role": user["role"],
        })
        return Token(
            access_token=access_token,
            token_type="bearer",
            user={
                "id": user["id"],
                "name": user["name"],
                "institution_id": user["institution_id"],
                "email": user.get("email") or "",
                "role": user["role"],
                "avatar": user.get("avatar", "male"),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get the current authenticated user's information."""
    return current_user


@router.post("/logout")
async def logout():
    """Logout endpoint — stateless, for client-side token removal."""
    return {"message": "Logged out successfully"}


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest):
    """Trigger Supabase Auth password reset email for a user."""
    try:
        sb = get_supabase()
        redirect_to = os.getenv("PASSWORD_RESET_REDIRECT_TO")
        options = {"redirect_to": redirect_to} if redirect_to else {}
        sb.auth.reset_password_email(str(payload.email), options=options)
        return {
            "message": "If this email exists, a password reset link has been sent.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.api_route("/change-password", methods=["POST", "PATCH", "PUT"])
async def change_password(
    payload: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    """Allow an authenticated user to change their password."""
    if len(payload.new_password or "") < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    try:
        sb = get_supabase()
        resp = (
            sb.table("users")
            .select("id,password_hash")
            .eq("id", current_user["id"])
            .limit(1)
            .execute()
        )
        user = resp.data[0] if resp.data else None
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if not verify_password(payload.current_password, user["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")

        new_hash = get_password_hash(payload.new_password)
        sb.table("users").update({"password_hash": new_hash}).eq("id", current_user["id"]).execute()
        return {"message": "Password changed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/google-login-url")
async def google_login_url():
    """Return Google OAuth authorize URL for Supabase Auth."""
    supabase_url = os.getenv("SUPABASE_URL")
    if not supabase_url:
        raise HTTPException(status_code=503, detail="SUPABASE_URL is not configured")

    params = {"provider": "google"}
    redirect_to = os.getenv("GOOGLE_OAUTH_REDIRECT_TO")
    if redirect_to:
        params["redirect_to"] = redirect_to

    return {
        "url": f"{supabase_url}/auth/v1/authorize?{urlencode(params)}",
    }


@router.get("/verify-email")
async def verify_email(token: str = Query(..., min_length=1)):
    """Verify a user's email using a signed verification token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("token_type") != "email_verification":
            raise HTTPException(status_code=400, detail="Invalid verification token")

        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=400, detail="Invalid verification token")

        sb = get_supabase()
        resp = sb.table("users").update({"status": "active"}).eq("id", user_id).execute()
        if not resp.data:
            raise HTTPException(status_code=404, detail="User not found")
        return {"message": "Email verified successfully. You can now login."}
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
