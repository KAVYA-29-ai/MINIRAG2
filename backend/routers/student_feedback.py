
"""
Student Feedback Router for MINI-RAG Backend

Allows students (and optionally teachers) to send anonymous or identified feedback to admins.
All feedback is stored in Supabase.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from database import get_supabase
from routers.auth import get_current_user

router = APIRouter()


class StudentFeedbackCreate(BaseModel):
    message: str
    is_anonymous: bool = True


@router.post("")
async def send_student_feedback(
    payload: StudentFeedbackCreate,
    current_user: dict = Depends(get_current_user),
):
    """Students can send feedback (optionally anonymous)."""
    if current_user.get("role") not in ("student", "teacher"):
        raise HTTPException(status_code=403, detail="Only students and teachers can send feedback here")
    try:
        sb = get_supabase()
        row = {
            "message": payload.message,
            "is_anonymous": payload.is_anonymous,
        }
        if not payload.is_anonymous:
            row["sender_id"] = current_user["id"]
        resp = sb.table("student_feedback").insert(row).execute()
        fb = resp.data[0] if resp.data else row
        return {"message": "Feedback sent successfully", "feedback": fb}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def get_student_feedback(
    current_user: dict = Depends(get_current_user),
):
    """Admins and teachers can view all student feedback."""
    if current_user.get("role") not in ("admin", "teacher"):
        raise HTTPException(status_code=403, detail="Only admins and teachers can view student feedback")
    try:
        sb = get_supabase()
        resp = (
            sb.table("student_feedback")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        feedback_items = resp.data or []

        sender_ids = list({item.get("sender_id") for item in feedback_items if item.get("sender_id")})
        sender_lookup = {}
        if sender_ids:
            user_resp = (
                sb.table("users")
                .select("id,name,institution_id")
                .in_("id", sender_ids)
                .execute()
            )
            sender_lookup = {user["id"]: user for user in (user_resp.data or [])}

        for item in feedback_items:
            user = sender_lookup.get(item.get("sender_id")) or {}
            if item.get("is_anonymous"):
                item["sender_name"] = None
                item["sender_institution_id"] = None
            else:
                item["sender_name"] = user.get("name")
                item["sender_institution_id"] = user.get("institution_id")
        return feedback_items
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
