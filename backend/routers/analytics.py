
"""
Analytics Router for MINI-RAG Backend

Provides endpoints for retrieving system analytics and statistics. All analytics data is queried from Supabase.
Only admins can access analytics endpoints.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timedelta
import re

from database import get_supabase
from core.rbac import require_roles

router = APIRouter()

POSITIVE_WORDS = {
    "good", "great", "helpful", "clear", "excellent", "amazing", "nice", "useful", "easy", "improved",
    "acha", "accha", "badhiya", "sahi", "shukriya", "dhanyavaad", "pasand",
}
NEGATIVE_WORDS = {
    "bad", "poor", "confusing", "slow", "issue", "problem", "difficult", "broken", "error", "worst",
    "bekar", "bekaar", "galat", "kharab", "faltu", "nahi", "not", "hard",
}


def _classify_feedback_sentiment(message: str) -> str:
    text = (message or "").lower()
    tokens = re.findall(r"[a-zA-Z\u0900-\u097F']+", text)
    if not tokens:
        return "neutral"

    positive_score = sum(1 for token in tokens if token in POSITIVE_WORDS)
    negative_score = sum(1 for token in tokens if token in NEGATIVE_WORDS)

    if positive_score > negative_score:
        return "positive"
    if negative_score > positive_score:
        return "negative"
    return "neutral"


@router.get("/summary")
async def get_system_summary(current_user: dict = Depends(require_roles("admin"))):
    """
    Get a summary of system analytics including users, searches, PDFs, and feedback.
    Only admins can view analytics.
    Returns a summary dictionary.
    """
    try:
        sb = get_supabase()
        users = sb.table("users").select("id").execute().data or []
        searches = sb.table("search_history").select("id").execute().data or []

        # PDFs now in Supabase too
        all_pdfs = sb.table("pdfs").select("id, status").execute().data or []
        total_pdfs = len(all_pdfs)
        indexed_pdfs = sum(1 for p in all_pdfs if p.get("status") == "indexed")

        today = datetime.utcnow().date().isoformat()
        today_searches = sb.table("search_history").select("id").gte("created_at", today).execute().data or []

        pending_fb = sb.table("feedback").select("id").eq("status", "pending").execute().data or []

        return {
            "total_users": len(users),
            "total_searches": len(searches),
            "total_pdfs": total_pdfs,
            "indexed_pdfs": indexed_pdfs,
            "today_searches": len(today_searches),
            "pending_feedback": len(pending_fb),
            "system_health": "healthy",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/usage-by-role")
async def get_usage_by_role(current_user: dict = Depends(require_roles("admin"))):
    """
    Get usage analytics grouped by user role. Only admins can view analytics.
    Returns a list of usage counts by role.
    """
    try:
        sb = get_supabase()
        sh = sb.table("search_history").select("user_id").execute().data or []
        if not sh:
            return []
        user_ids = list({s["user_id"] for s in sh if s.get("user_id")})
        users_resp = sb.table("users").select("id, role").in_("id", user_ids).execute()
        id_to_role = {u["id"]: u["role"] for u in (users_resp.data or [])}

        from collections import Counter
        counts = Counter(id_to_role.get(s["user_id"], "unknown") for s in sh if s.get("user_id"))
        total = sum(counts.values())
        return [
            {"role": role, "count": cnt, "percentage": round(cnt / total * 100, 1)}
            for role, cnt in counts.most_common()
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/language-usage")
async def get_language_usage(current_user: dict = Depends(require_roles("admin"))):
    try:
        sb = get_supabase()
        rows = sb.table("search_history").select("language").execute().data or []
        from collections import Counter
        counts = Counter(r.get("language") or "english" for r in rows)
        return [{"language": lang, "count": cnt} for lang, cnt in counts.most_common()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/daily-queries")
async def get_daily_queries(days: int = 30, current_user: dict = Depends(require_roles("admin"))):
    try:
        sb = get_supabase()
        start = (datetime.utcnow() - timedelta(days=days)).isoformat()
        rows = sb.table("search_history").select("created_at").gte("created_at", start).execute().data or []
        from collections import Counter
        counts = Counter(r["created_at"][:10] for r in rows)
        return [{"date": d, "count": c} for d, c in sorted(counts.items())]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/student-insights")
async def get_student_insights(current_user: dict = Depends(require_roles("admin", "teacher"))):
    try:
        sb = get_supabase()
        students = sb.table("users").select("id, name, institution_id").eq("role", "student").execute().data or []
        total_students = len(students)

        sh = sb.table("search_history").select("user_id").execute().data or []
        student_ids = {s["id"] for s in students}
        from collections import Counter
        student_search_counts = Counter(s["user_id"] for s in sh if s.get("user_id") in student_ids)

        id_map = {s["id"]: s for s in students}
        active_learners = [
            {"name": id_map[uid]["name"], "institution_id": id_map[uid]["institution_id"], "searches": cnt}
            for uid, cnt in student_search_counts.most_common(5) if uid in id_map
        ]
        total_student_searches = sum(student_search_counts.values())
        return {
            "total_students": total_students,
            "active_learners": active_learners,
            "avg_queries_per_student": round(total_student_searches / max(total_students, 1), 1),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-topics")
async def get_top_topics(limit: int = 10, current_user: dict = Depends(require_roles("admin", "teacher"))):
    try:
        sb = get_supabase()
        rows = sb.table("search_history").select("query").execute().data or []
        from collections import Counter
        counts = Counter(r["query"] for r in rows if r.get("query"))
        return [{"topic": q, "count": c, "trend": "stable"} for q, c in counts.most_common(limit)]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/feedback-sentiment")
async def get_feedback_sentiment(current_user: dict = Depends(require_roles("admin", "teacher"))):
    """Return positive/negative/neutral sentiment breakdown for student feedback."""
    try:
        sb = get_supabase()
        rows = sb.table("student_feedback").select("message").execute().data or []

        summary = {"positive": 0, "negative": 0, "neutral": 0}
        for row in rows:
            sentiment = _classify_feedback_sentiment(row.get("message", ""))
            summary[sentiment] += 1

        total = max(len(rows), 1)
        return {
            "total": len(rows),
            "positive": summary["positive"],
            "negative": summary["negative"],
            "neutral": summary["neutral"],
            "positive_percentage": round((summary["positive"] / total) * 100, 1),
            "negative_percentage": round((summary["negative"] / total) * 100, 1),
            "neutral_percentage": round((summary["neutral"] / total) * 100, 1),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
