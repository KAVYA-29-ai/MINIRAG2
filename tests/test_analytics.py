from unittest.mock import MagicMock

import _mock_setup as _ms
import routers.auth as auth_router

_mock_sb = _ms.mock_sb
_client = _ms.client
_app = _ms._main.app


def _override_admin():
    async def _dep():
        return {
            "id": 1,
            "name": "Admin",
            "institution_id": "admin001",
            "role": "admin",
            "avatar": "male",
            "status": "active",
        }

    return _dep


def setup_function():
    _mock_sb.reset_mock()
    _mock_sb.table.side_effect = None
    _app.dependency_overrides.clear()
    _ms._main._ip_buckets.clear()


def teardown_function():
    _app.dependency_overrides.clear()


def test_analytics_summary_returns_expected_keys():
    _app.dependency_overrides[auth_router.get_current_user] = _override_admin()

    users_table = MagicMock()
    users_table.select.return_value.execute.return_value = MagicMock(data=[{"id": 1}, {"id": 2}, {"id": 3}])

    search_table = MagicMock()
    search_select = search_table.select.return_value
    search_select.execute.return_value = MagicMock(data=[{"id": 1}, {"id": 2}])
    search_select.gte.return_value.execute.return_value = MagicMock(data=[{"id": 2}])

    pdfs_table = MagicMock()
    pdfs_table.select.return_value.execute.return_value = MagicMock(
        data=[{"id": 1, "status": "indexed"}, {"id": 2, "status": "pending"}]
    )

    feedback_table = MagicMock()
    feedback_table.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": "fb-1"}])

    def table_side_effect(name):
        mapping = {
            "users": users_table,
            "search_history": search_table,
            "pdfs": pdfs_table,
            "feedback": feedback_table,
        }
        return mapping[name]

    _mock_sb.table.side_effect = table_side_effect

    response = _client.get("/api/analytics/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["total_users"] == 3
    assert body["total_searches"] == 2
    assert body["indexed_pdfs"] == 1
    assert body["pending_feedback"] == 1


def test_usage_by_role_returns_counts_and_percentages():
    _app.dependency_overrides[auth_router.get_current_user] = _override_admin()

    search_table = MagicMock()
    search_table.select.return_value.execute.return_value = MagicMock(
        data=[
            {"user_id": 1},
            {"user_id": 1},
            {"user_id": 2},
        ]
    )

    users_table = MagicMock()
    users_table.select.return_value.in_.return_value.execute.return_value = MagicMock(
        data=[{"id": 1, "role": "student"}, {"id": 2, "role": "teacher"}]
    )

    def table_side_effect(name):
        mapping = {
            "search_history": search_table,
            "users": users_table,
        }
        return mapping[name]

    _mock_sb.table.side_effect = table_side_effect

    response = _client.get("/api/analytics/usage-by-role")

    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 2
    assert body[0]["role"] in ["student", "teacher"]
    assert "percentage" in body[0]


def test_usage_by_role_empty_returns_empty_list():
    _app.dependency_overrides[auth_router.get_current_user] = _override_admin()

    search_table = MagicMock()
    search_table.select.return_value.execute.return_value = MagicMock(data=[])

    _mock_sb.table.side_effect = lambda name: {"search_history": search_table}[name]

    response = _client.get("/api/analytics/usage-by-role")

    assert response.status_code == 200
    assert response.json() == []
