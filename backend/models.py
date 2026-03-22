
"""Typed API contracts for EduRag.

This module intentionally keeps validation logic close to schemas so route
handlers stay focused on orchestration. It also standardizes text hygiene
for user-authored fields (queries, names, feedback) to reduce noisy data.
"""

from datetime import datetime
from enum import Enum
import re
from typing import List, Optional

import bleach
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserRole(str, Enum):
    """Supported user roles."""

    student = "student"
    teacher = "teacher"
    admin = "admin"


class FeedbackCategory(str, Enum):
    """Feedback categories used for routing and analytics."""

    system = "system"
    feature = "feature"
    content = "content"
    rag = "rag"
    student = "student"
    other = "other"


class FeedbackStatus(str, Enum):
    """Lifecycle state of a feedback thread."""

    pending = "pending"
    responded = "responded"
    archived = "archived"


class TextHygiene:
    """Text sanitation helpers used across request models."""

    TAG_PATTERN = re.compile(r"<[^>]+>")
    MULTISPACE_PATTERN = re.compile(r"\s+")

    @classmethod
    def plain_text(cls, value: Optional[str]) -> str:
        """Strip html markup safely and normalize whitespace."""
        without_tags = bleach.clean(value or "", tags=[], attributes={}, strip=True)
        normalized = cls.MULTISPACE_PATTERN.sub(" ", without_tags).strip()
        return normalized

    @classmethod
    def ensure_non_empty(cls, value: Optional[str], field_name: str) -> str:
        """Return normalized text or raise a field-specific validation error."""
        cleaned = cls.plain_text(value)
        if not cleaned:
            raise ValueError(f"{field_name} is required")
        return cleaned


class UserRegister(BaseModel):
    """Payload for user sign-up."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=80)
    institution_id: str = Field(min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    password: str = Field(min_length=6, max_length=128)
    avatar: str = Field(default="male")
    role: UserRole = UserRole.student

    @field_validator("avatar")
    @classmethod
    def validate_avatar(cls, value: str) -> str:
        """Allow only the predefined avatar values used by the frontend."""
        allowed = {"male", "female"}
        if value not in allowed:
            raise ValueError("avatar must be either 'male' or 'female'")
        return value

    @field_validator("institution_id")
    @classmethod
    def normalize_institution_id(cls, value: str) -> str:
        """Normalize institution IDs for stable identity matching."""
        return value.strip()

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, value: str) -> str:
        """Store display names as plain text."""
        return TextHygiene.ensure_non_empty(value, "name")


class UserLogin(BaseModel):
    """Payload for user login."""

    model_config = ConfigDict(str_strip_whitespace=True)

    institution_id: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class Token(BaseModel):
    """Authentication response contract."""

    access_token: str
    token_type: str
    user: dict
    requires_verification: bool = False
    message: Optional[str] = None


class UserBase(BaseModel):
    """Common user data shape used by multiple responses."""

    id: Optional[int] = None
    name: str
    institution_id: str
    email: Optional[EmailStr] = None
    role: UserRole
    avatar: str
    status: str = "active"
    created_at: Optional[datetime] = None


class UserUpdate(BaseModel):
    """Patch payload for profile and admin user updates."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = None
    avatar: Optional[str] = None
    role: Optional[UserRole] = None
    status: Optional[str] = None


class UserResponse(BaseModel):
    """User object returned to clients."""

    id: int
    name: str
    institution_id: str
    email: Optional[EmailStr] = None
    role: UserRole
    avatar: str
    status: str
    created_at: datetime


class FeedbackCreate(BaseModel):
    """Payload used to submit a new feedback entry."""

    model_config = ConfigDict(str_strip_whitespace=True)

    category: FeedbackCategory
    message: str = Field(min_length=3, max_length=5000)

    @field_validator("message")
    @classmethod
    def sanitize_message(cls, value: str) -> str:
        """Normalize feedback and enforce minimum useful signal length."""
        sanitized = TextHygiene.ensure_non_empty(value, "message")
        if len(sanitized) < 3:
            raise ValueError("message must contain at least 3 characters")
        return sanitized


class FeedbackResponse(BaseModel):
    """Structured feedback record visible in dashboards."""

    id: int
    sender_id: int
    sender_name: str
    sender_institution_id: str
    sender_avatar: str
    category: FeedbackCategory
    message: str
    status: FeedbackStatus
    admin_response: Optional[str] = None
    created_at: datetime


class FeedbackUpdate(BaseModel):
    """Patch payload for admin actions on feedback threads."""

    status: Optional[FeedbackStatus] = None
    admin_response: Optional[str] = None

    @field_validator("admin_response")
    @classmethod
    def sanitize_admin_response(cls, value: Optional[str]) -> Optional[str]:
        """Normalize optional admin response before persistence."""
        if value is None:
            return None
        cleaned = TextHygiene.plain_text(value)
        return cleaned or None


class RAGQuery(BaseModel):
    """Search request contract used by RAG endpoints."""

    model_config = ConfigDict(str_strip_whitespace=True)

    query: str = Field(min_length=1, max_length=1000)
    language: str = "english"

    @field_validator("language")
    @classmethod
    def normalize_language(cls, value: str) -> str:
        """Normalize language values into supported product options."""
        allowed = {"english", "hindi", "hinglish", "auto"}
        normalized = (value or "english").strip().lower()
        if normalized not in allowed:
            return "english"
        return normalized

    @field_validator("query")
    @classmethod
    def sanitize_query(cls, value: str) -> str:
        """Normalize free-text query input."""
        return TextHygiene.ensure_non_empty(value, "query")


class RAGResult(BaseModel):
    """Single retrieved chunk in a RAG response."""

    id: int
    content: str
    source: str
    relevance_score: float
    page_number: Optional[int] = None


class RAGResponse(BaseModel):
    """Top-level response returned by RAG search."""

    query: str
    results: List[RAGResult]
    total_results: int
    response_time_ms: int


class SearchHistory(BaseModel):
    """Search history entry exposed to clients."""

    id: int
    user_id: int
    query: str
    language: str
    results_count: int
    created_at: datetime


class AnalyticsSummary(BaseModel):
    """High-level analytics summary metrics."""

    total_queries: int
    total_pdfs: int
    rag_accuracy: float
    avg_response_time: float
    active_users: int


class TopicAnalysis(BaseModel):
    """Per-topic usage insight used by analysis dashboards."""

    topic: str
    search_count: int
    difficulty: str


class UsageByRole(BaseModel):
    """Role-based usage distribution payload."""

    role: str
    percentage: float
    count: int


class LanguageUsage(BaseModel):
    """Language-level usage breakdown payload."""

    language: str
    percentage: float
    count: int
