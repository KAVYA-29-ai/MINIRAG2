from unittest.mock import MagicMock

import _mock_setup as _ms

import routers.auth as auth_router

_mock_sb = _ms.mock_sb
_client = _ms.client
_app = _ms._main.app


def _admin_user():
    return {
        "id": 1,
        "name": "Admin",
        "institution_id": "admin001",
        "email": "admin@test.com",
        "role": "admin",
        "avatar": "male",
        "status": "active",
    }


def _override_current_user(user=None):
    async def _dep():
        return user or _admin_user()

    return _dep


def setup_function():
    _mock_sb.reset_mock()
    _mock_sb.table.side_effect = None
    _app.dependency_overrides.clear()
    _ms._main._ip_buckets.clear()


def teardown_function():
    _app.dependency_overrides.clear()


def test_create_user_register_success():
    _mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
    _mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": 100,
                "name": "Student A",
                "institution_id": "student100",
                "email": "student100@test.com",
                "role": "student",
                "avatar": "male",
                "status": "active",
            }
        ]
    )

    response = _client.post(
        "/api/auth/register",
        json={
            "name": "Student A",
            "institution_id": "student100",
            "email": "student100@test.com",
            "password": "testpass123",
            "role": "student",
            "avatar": "male",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["user"]["institution_id"] == "student100"


def test_get_user_by_id_admin_success():
    _app.dependency_overrides[auth_router.get_current_user] = _override_current_user()
    _mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": 10,
                "name": "User Ten",
                "institution_id": "u10",
                "email": "u10@test.com",
                "role": "student",
                "avatar": "male",
                "status": "active",
                "created_at": "2026-03-22T00:00:00",
            }
        ]
    )

    response = _client.get("/api/users/10")

    assert response.status_code == 200
    assert response.json()["id"] == 10


def test_update_user_role_admin_success():
    _app.dependency_overrides[auth_router.get_current_user] = _override_current_user()
    _mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": 11, "name": "User Eleven", "role": "teacher"}]
    )

    response = _client.patch("/api/users/11/role", json={"role": "teacher"})

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "teacher"


def test_delete_user_admin_success():
    _app.dependency_overrides[auth_router.get_current_user] = _override_current_user()
    _mock_sb.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": 12}])

    response = _client.delete("/api/users/12")

    assert response.status_code == 200
    assert response.json()["message"] == "User deleted successfully"


def test_update_user_role_teacher_forbidden():
    teacher = _admin_user() | {"id": 2, "role": "teacher"}
    _app.dependency_overrides[auth_router.get_current_user] = _override_current_user(teacher)

    response = _client.patch("/api/users/13/role", json={"role": "admin"})

    assert response.status_code == 403
