from unittest.mock import MagicMock

import _mock_setup as _ms
import routers.auth as auth_router

_client = _ms.client
_mock_sb = _ms.mock_sb


def _new_user():
    return {
        "id": 42,
        "name": "Verify User",
        "institution_id": "student042",
        "email": "verify@test.com",
        "role": "student",
        "avatar": "male",
        "status": "pending_verification",
        "password_hash": "hashed",
    }


def test_register_requires_verification_when_enabled(monkeypatch):
    monkeypatch.setattr(auth_router, "EMAIL_VERIFICATION_REQUIRED", True)

    _mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
        MagicMock(data=[])
    )
    _mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[_new_user()])

    response = _client.post(
        "/api/auth/register",
        json={
            "name": "Verify User",
            "institution_id": "student042",
            "email": "verify@test.com",
            "password": "strongpass",
            "role": "student",
            "avatar": "male",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["requires_verification"] is True
    assert payload["access_token"] == ""


def test_verify_email_rejects_bad_token():
    response = _client.get("/api/auth/verify-email", params={"token": "invalid"})
    assert response.status_code == 400
