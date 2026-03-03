"""
Users Router - User Management (Admin)
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional

from models import UserResponse, UserUpdate, UserRole
from database import get_db
from sqlite_models import User
from routers.auth import get_current_user

router = APIRouter()

@router.get("/", response_model=List[dict])
async def get_all_users(
    role: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all users (Admin/Teacher only)"""
    if current_user.get("role") not in ["admin", "teacher"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        query = db.query(User)
        
        if role:
            query = query.filter(User.role == role)
        if status:
            query = query.filter(User.status == status)
        
        users = query.all()
        return [
            {
                "id": u.id,
                "name": u.name,
                "institution_id": u.institution_id,
                "role": u.role,
                "avatar": u.avatar,
                "status": u.status,
                "created_at": u.created_at.isoformat() if u.created_at else None
            }
            for u in users
        ]
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/students")
async def get_students(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all students - accessible by all authenticated users for buddies feature"""
    
    students = db.query(User).filter(User.role == "student").all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "institution_id": u.institution_id,
            "avatar": u.avatar,
            "status": u.status
        }
        for u in students
    ]

@router.get("/teachers")
async def get_teachers(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all teachers"""
    teachers = db.query(User).filter(User.role == "teacher").all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "institution_id": u.institution_id,
            "avatar": u.avatar,
            "status": u.status
        }
        for u in teachers
    ]

@router.get("/stats")
async def get_user_stats(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user statistics (Admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view stats")
    
    total = db.query(func.count(User.id)).scalar()
    students = db.query(func.count(User.id)).filter(User.role == "student").scalar()
    teachers = db.query(func.count(User.id)).filter(User.role == "teacher").scalar()
    admins = db.query(func.count(User.id)).filter(User.role == "admin").scalar()
    active = db.query(func.count(User.id)).filter(User.status == "active").scalar()
    
    return {
        "total_users": total,
        "students": students,
        "teachers": teachers,
        "admins": admins,
        "active_users": active,
        "inactive_users": total - active
    }

@router.get("/me")
async def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """Get current user profile"""
    return current_user

@router.get("/{user_id}")
async def get_user(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific user"""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "id": user.id,
            "name": user.name,
            "institution_id": user.institution_id,
            "role": user.role,
            "avatar": user.avatar,
            "status": user.status,
            "created_at": user.created_at.isoformat() if user.created_at else None
        }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{user_id}")
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user (Admin only for role changes, users can update own profile)"""
    is_admin = current_user.get("role") == "admin"
    is_own_profile = current_user.get("id") == user_id
    
    if not is_admin and not is_own_profile:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    if user_update.role and not is_admin:
        raise HTTPException(status_code=403, detail="Only admins can change user roles")
    
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        update_data = user_update.dict(exclude_unset=True)
        for key, value in update_data.items():
            if value is not None:
                setattr(user, key, value.value if hasattr(value, 'value') else value)
        
        db.commit()
        db.refresh(user)
        
        return {
            "message": "User updated successfully",
            "user": {"id": user.id, "name": user.name, "role": user.role, "avatar": user.avatar, "status": user.status}
        }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{user_id}/role")
async def change_user_role(
    user_id: int,
    role_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change user role (Admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can change user roles")
    
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        new_role = role_data.get("role")
        if new_role not in ["student", "teacher", "admin"]:
            raise HTTPException(status_code=400, detail="Invalid role")
        
        user.role = new_role
        db.commit()
        
        return {"message": f"User role changed to {new_role}", "user": {"id": user.id, "name": user.name, "role": user.role}}
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete user (Admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete users")
    
    if current_user.get("id") == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        db.delete(user)
        db.commit()
        
        return {"message": "User deleted successfully"}
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
