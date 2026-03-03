"""
Authentication Router - Login, Register, Token Management
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import os
from dotenv import load_dotenv

from models import UserRegister, UserLogin, Token, UserRole
from database import get_db
from sqlite_models import User

load_dotenv()

router = APIRouter()
security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Decode JWT token and get current user"""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: int = payload.get("user_id")
        institution_id: str = payload.get("institution_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Get user from SQLite database
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            return {
                "id": user.id,
                "name": user.name,
                "institution_id": user.institution_id,
                "role": user.role,
                "avatar": user.avatar,
                "status": user.status
            }
        
        # Return payload data if user not found
        return {
            "id": user_id,
            "institution_id": institution_id,
            "role": payload.get("role", "student")
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_role(allowed_roles: list):
    """Dependency to check user role"""
    async def check_role(user: dict = Depends(get_current_user)):
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return check_role

@router.post("/register", response_model=Token)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user"""
    try:
        # Check if user exists
        existing = db.query(User).filter(User.institution_id == user_data.institution_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="User with this Institution ID already exists")
        
        # Hash password
        hashed_password = get_password_hash(user_data.password)
        
        # Create user in database
        new_user = User(
            name=user_data.name,
            institution_id=user_data.institution_id,
            password_hash=hashed_password,
            role=user_data.role.value,
            avatar=user_data.avatar,
            status="active"
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        # Create token
        access_token = create_access_token({
            "user_id": new_user.id,
            "institution_id": new_user.institution_id,
            "role": new_user.role
        })
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            user={
                "id": new_user.id,
                "name": new_user.name,
                "institution_id": new_user.institution_id,
                "role": new_user.role,
                "avatar": new_user.avatar
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/login", response_model=Token)
async def login(user_data: UserLogin, db: Session = Depends(get_db)):
    """Login user and return JWT token"""
    try:
        # Get credentials from JSON data
        institution_id = user_data.institution_id
        password = user_data.password
        
        # Check SQLite database
        user = db.query(User).filter(User.institution_id == institution_id).first()
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        if not verify_password(password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        access_token = create_access_token({
            "user_id": user.id,
            "institution_id": user.institution_id,
            "role": user.role
        })
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            user={
                "id": user.id,
                "name": user.name,
                "institution_id": user.institution_id,
                "role": user.role,
                "avatar": user.avatar
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user info"""
    return current_user

@router.post("/logout")
async def logout():
    """Logout user (client-side token removal)"""
    return {"message": "Logged out successfully"}
