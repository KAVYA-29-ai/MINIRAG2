from datetime import datetime

import pytest
from pydantic import ValidationError

from models import (
    FeedbackCategory,
    FeedbackCreate,
    RAGQuery,
    UserLogin,
    UserRegister,
    UserRole,
)


def test_user_register_defaults_are_applied():
    payload = UserRegister(
        name="Alice",
        institution_id="student001",
        password="strong-password",
    )

    assert payload.role == UserRole.student
    assert payload.avatar == "male"
    assert payload.email is None


def test_user_register_rejects_invalid_role():
    with pytest.raises(ValidationError):
        UserRegister(
            name="Alice",
            institution_id="student001",
            password="strong-password",
            role="superadmin",
        )


def test_user_login_requires_all_fields():
    with pytest.raises(ValidationError):
        UserLogin(institution_id="student001")


def test_rag_query_default_language_is_english():
    query = RAGQuery(query="What is photosynthesis?")

    assert query.language == "english"


def test_feedback_category_enum_has_expected_values():
    assert FeedbackCategory.system.value == "system"
    assert FeedbackCategory.feature.value == "feature"
    assert FeedbackCategory.content.value == "content"
    assert FeedbackCategory.rag.value == "rag"
    assert FeedbackCategory.student.value == "student"
    assert FeedbackCategory.other.value == "other"


def test_feedback_message_strips_html():
    payload = FeedbackCreate(category=FeedbackCategory.feature, message="<b>Need</b> better filters")
    assert payload.message == "Need better filters"


def test_rag_query_strips_html():
    payload = RAGQuery(query="<script>alert(1)</script> photosynthesis")
    assert payload.query == "alert(1) photosynthesis"


def test_user_register_name_is_sanitized():
    payload = UserRegister(
        name="<h1>Alice</h1>",
        institution_id="student001",
        password="strong-password",
    )
    assert payload.name == "Alice"


def test_model_datetime_parsing_roundtrip():
    from models import UserResponse

    row = UserResponse(
        id=1,
        name="Alice",
        institution_id="student001",
        email="alice@example.com",
        role=UserRole.student,
        avatar="female",
        status="active",
        created_at="2026-03-01T10:30:00",
    )

    assert isinstance(row.created_at, datetime)
