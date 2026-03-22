import os
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import _mock_setup as _ms
from jose import jwt
from starlette.websockets import WebSocketDisconnect

import routers.auth as auth_router

_mock_sb = _ms.mock_sb
_client = _ms.client
_app = _ms._main.app


def _student_user():
    return {
        "id": 21,
        "name": "Student",
        "institution_id": "student021",
        "role": "student",
        "avatar": "male",
        "status": "active",
    }


def _override_student():
    async def _dep():
        return _student_user()

    return _dep


def _ws_token(user_id=21):
    return jwt.encode(
        {
            "user_id": user_id,
            "institution_id": f"student{user_id}",
            "role": "student",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
        },
        os.getenv("JWT_SECRET", "your-secret-key"),
        algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
    )


def setup_function():
    _mock_sb.reset_mock()
    _mock_sb.table.side_effect = None
    _app.dependency_overrides.clear()
    _ms._main._ip_buckets.clear()


def teardown_function():
    _app.dependency_overrides.clear()


def test_send_chat_message_student_success():
    _app.dependency_overrides[auth_router.get_current_user] = _override_student()
    _mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": 1,
                "sender_id": 21,
                "sender_name": "Student",
                "message": "Hello class",
                "created_at": "2026-03-22T10:00:00",
            }
        ]
    )

    response = _client.post("/api/chat/messages", json={"message": "Hello class"})

    assert response.status_code == 200
    assert response.json()["message"] == "Hello class"


def test_get_chat_messages_student_success():
    _app.dependency_overrides[auth_router.get_current_user] = _override_student()
    _mock_sb.table.return_value.select.return_value.gte.return_value.order.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": 1,
                "sender_id": 21,
                "sender_name": "Student",
                "message": "Hi",
                "created_at": "2026-03-22T10:00:00",
            }
        ]
    )

    response = _client.get("/api/chat/messages")

    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert response.json()[0]["sender_id"] == 21


def test_delete_own_chat_message_success():
    _app.dependency_overrides[auth_router.get_current_user] = _override_student()

    chat_table = MagicMock()
    chat_table.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": 9, "sender_id": 21, "message": "remove"}]
    )
    chat_table.delete.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": 9}])

    _mock_sb.table.side_effect = lambda name: {"chat_messages": chat_table}[name]

    response = _client.delete("/api/chat/messages/9")

    assert response.status_code == 200
    assert response.json()["deleted"] is True


def test_websocket_requires_token():
    try:
        with _client.websocket_connect("/api/ws/chat"):
            pass
        assert False, "websocket connection should not be accepted without token"
    except WebSocketDisconnect:
        assert True


def test_websocket_broadcast_basic_message():
    token = _ws_token()

    with _client.websocket_connect(f"/api/ws/chat?token={token}") as ws:
        ws.send_text("hello realtime")
        payload = ws.receive_text()

    assert payload == "hello realtime"
