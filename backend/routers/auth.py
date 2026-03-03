"""
Authentication Router — all user data lives in Supabase.
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

from models import UserRegister, UserLogin, Token, UserRole
from database import get_supabase

load_dotenv()

router = APIRouter()
security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Decode JWT and fetch user row from Supabase."""
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

        # Fallback to token payload
        return {
            "id": user_id,
            "institution_id": payload.get("institution_id", ""),
            "role": payload.get("role", "student"),
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_role(allowed_roles: list):
    async def check_role(user: dict = Depends(get_current_user)):
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return check_role


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/register", response_model=Token)
async def register(user_data: UserRegister):
    """Register a new user (stored in Supabase)."""
    try:
        sb = get_supabase()

        # Check duplicate institution_id
        existing = sb.table("users").select("id").eq("institution_id", user_data.institution_id).limit(1).execute()
        if existing.data and len(existing.data) > 0:
            raise HTTPException(status_code=400, detail="User with this Institution ID already exists")

        hashed_password = get_password_hash(user_data.password)

        row = {
            "name": user_data.name,
            "institution_id": user_data.institution_id,
            "email": user_data.email or "",
            "password_hash": hashed_password,
            "role": user_data.role.value,
            "avatar": user_data.avatar,
            "status": "active",
        }

        resp = sb.table("users").insert(row).execute()
        new_user = resp.data[0]

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
async def login(user_data: UserLogin):
    """Login — verify credentials against Supabase users table."""
    try:
        sb = get_supabase()
        resp = sb.table("users").select("*").eq("institution_id", user_data.institution_id).limit(1).execute()
        user = resp.data[0] if resp.data else None

        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

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
    return current_user


@router.post("/logout")
async def logout():
    return {"message": "Logged out successfully"}
