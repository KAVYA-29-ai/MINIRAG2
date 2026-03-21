
"""
Chat Router for MINI-RAG Backend

Provides endpoints for student chatroom functionality. Messages are auto-deleted after a configurable timer.
Includes message creation and retrieval endpoints. Only students can send messages.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List
from datetime import datetime, timedelta
import os

from database import get_supabase
from routers.auth import get_current_user

router = APIRouter()

CHAT_MESSAGE_LIFETIME = int(os.getenv('CHAT_MESSAGE_LIFETIME', 60))  # seconds

class ChatMessageCreate(BaseModel):
    message: str

class ChatMessageOut(BaseModel):
    id: int
    sender_id: int
    sender_name: str
    message: str
    created_at: datetime

@router.post("/messages", response_model=ChatMessageOut)
async def send_message(
    payload: ChatMessageCreate,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Only students can send messages")
    try:
        sb = get_supabase()
        row = {
            "sender_id": current_user["id"],
            "sender_name": current_user["name"],
            "message": payload.message,
        }
        resp = sb.table("chat_messages").insert(row).execute()
        msg = resp.data[0]
        return msg
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/messages", response_model=List[ChatMessageOut])
async def get_messages(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Only students can view messages")
    try:
        sb = get_supabase()
        cutoff = datetime.utcnow() - timedelta(hours=1)
        resp = sb.table("chat_messages").select("*").gte("created_at", cutoff.isoformat()).order("created_at", desc=False).execute()
        return resp.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/messages/{message_id}")
async def delete_message(message_id: int, current_user: dict = Depends(get_current_user)):
    """
    Allow a user to delete their own chat message by ID.
    """
    try:
        sb = get_supabase()
        # Check if the message belongs to the current user
        resp = sb.table("chat_messages").select("*").eq("id", message_id).execute()
        if not resp.data or resp.data[0]["sender_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="You can only delete your own messages.")
        sb.table("chat_messages").delete().eq("id", message_id).execute()
        return {"deleted": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/messages/cleanup")
async def cleanup_old_messages():
    """
    Delete chat messages older than 1 hour.
    """
    try:
        sb = get_supabase()
        cutoff = datetime.utcnow() - timedelta(hours=1)
        resp = sb.table("chat_messages").delete().lt("created_at", cutoff.isoformat()).execute()
        return {"deleted": resp.count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
