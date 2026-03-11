"""
Feedback Router — all data in Supabase.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime

from models import FeedbackCreate
from database import get_supabase
from routers.auth import get_current_user

router = APIRouter()


@router.post("/")
async def create_feedback(
    feedback_data: FeedbackCreate,
    current_user: dict = Depends(get_current_user),
):
    """
    Create a new feedback entry in Supabase. Only teachers can submit feedback.
    Returns the created feedback object.
    """
    if current_user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can submit feedback")
    try:
        sb = get_supabase()
        row = {
            "sender_id": current_user["id"],
            "category": feedback_data.category.value,
            "message": feedback_data.message,
            "status": "pending",
        }
        resp = sb.table("feedback").insert(row).execute()
        fb = resp.data[0]
        return {"message": "Feedback submitted successfully", "feedback": fb}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mine")
async def get_my_feedback(current_user: dict = Depends(get_current_user)):
    """
    Retrieve all feedback submitted by the current user.
    Returns a list of feedback entries.
    """
    try:
        sb = get_supabase()
        resp = (
            sb.table("feedback")
            .select("*")
            .eq("sender_id", current_user["id"])
            .order("created_at", desc=True)
            .execute()
        )
        return resp.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def get_all_feedback(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Retrieve all feedback entries, optionally filtered by status. Only admins can view all feedback.
    Returns a list of feedback entries.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view all feedback")
    try:
        sb = get_supabase()
        q = sb.table("feedback").select("*, users!sender_id(name, institution_id, avatar)")
        if status:
            q = q.eq("status", status)
        resp = q.order("created_at", desc=True).execute()

        results = []
        for row in resp.data or []:
            sender = row.pop("users", None) or {}
            row["sender_name"] = sender.get("name", "Unknown")
            row["sender_institution_id"] = sender.get("institution_id", "Unknown")
            row["sender_avatar"] = sender.get("avatar", "male")
            results.append(row)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{feedback_id}/respond")
async def respond_to_feedback(
    feedback_id: int,
    response_data: dict,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can respond to feedback")
    try:
        sb = get_supabase()
        resp = (
            sb.table("feedback")
            .update({
                "admin_response": response_data.get("response"),
                "status": "responded",
                "responded_by": current_user["id"],
                "responded_at": datetime.utcnow().isoformat(),
            })
            .eq("id", feedback_id)
            .execute()
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Feedback not found")
        return {"message": "Response sent successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{feedback_id}/archive")
async def archive_feedback(
    feedback_id: int,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can archive feedback")
    try:
        sb = get_supabase()
        resp = sb.table("feedback").update({"status": "archived"}).eq("id", feedback_id).execute()
        if not resp.data:
            raise HTTPException(status_code=404, detail="Feedback not found")
        return {"message": "Feedback archived"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_feedback_stats(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view stats")
    try:
        sb = get_supabase()
        rows = sb.table("feedback").select("id, status").execute().data or []
        total = len(rows)
        pending = sum(1 for r in rows if r["status"] == "pending")
        responded = sum(1 for r in rows if r["status"] == "responded")
        archived = sum(1 for r in rows if r["status"] == "archived")
        return {"total": total, "pending": pending, "responded": responded, "archived": archived}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
