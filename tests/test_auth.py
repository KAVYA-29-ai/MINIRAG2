import os, pytest
from unittest.mock import MagicMock
import _mock_setup as _ms

_mock_sb = _ms.mock_sb
_client = _ms.client

from passlib.context import CryptContext
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
TEST_PASSWORD = "testpass123"  # NOSONAR - test credential only
TEST_JWT_SECRET = "your-secret-key"  # NOSONAR - test secret only

def _user(role="student", pw=TEST_PASSWORD):
    return {"id": f"uuid-{role}", "name": f"{role} user",
            "institution_id": f"{role}001", "email": f"{role}@t.com",
            "role": role, "avatar": "male", "status": "active",
            "password_hash": _pwd.hash(pw)}

def _jwt(role="student"):
    from jose import jwt as j
    from datetime import datetime, timedelta, timezone
    return j.encode({"user_id": f"uuid-{role}", "institution_id": f"{role}001",
                     "role": role, "exp": datetime.now(timezone.utc) + timedelta(minutes=60)},
                    os.getenv("JWT_SECRET", TEST_JWT_SECRET), algorithm="HS256")

def _auth(role="student"):
    return {"Authorization": f"Bearer {_jwt(role)}"}

def _set(role="student", data=None):
    _mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=data if data is not None else [_user(role)])

@pytest.fixture(autouse=True)
def _reset():
    _mock_sb.reset_mock()
    _mock_sb.table.side_effect = None
    _ms._main._ip_buckets.clear()
    _mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
    _mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])
    yield

class TestRegister:
    def test_success(self):
        _set(data=[])
        _mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[_user()])
        r = _client.post("/api/auth/register", json={"name": "T", "institution_id": "student001",
            "email": "t@t.com", "password": TEST_PASSWORD, "role": "student", "avatar": "male"})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_duplicate_400(self):
        _set(data=[_user()])
        r = _client.post("/api/auth/register", json={"name": "T", "institution_id": "student001",
            "email": "x@x.com", "password": TEST_PASSWORD, "role": "student", "avatar": "male"})
        assert r.status_code == 400

    def test_missing_name_422(self):
        r = _client.post("/api/auth/register", json={"institution_id": "x", "password": "p", "role": "student", "avatar": "male"})
        assert r.status_code == 422

    def test_missing_password_422(self):
        r = _client.post("/api/auth/register", json={"name": "T", "institution_id": "x", "role": "student", "avatar": "male"})
        assert r.status_code == 422

    def test_invalid_role_rejected(self):
        r = _client.post("/api/auth/register", json={"name": "T", "institution_id": "x",
            "email": "t@t.com", "password": "p", "role": "superadmin", "avatar": "male"})
        assert r.status_code in [400, 422]

class TestLogin:
    def test_success(self):
        _set()
        r = _client.post("/api/auth/login", json={"institution_id": "student001", "password": TEST_PASSWORD})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_token_has_role(self):
        from jose import jwt as j
        _set("teacher")
        r = _client.post("/api/auth/login", json={"institution_id": "teacher001", "password": TEST_PASSWORD})
        assert r.status_code == 200
        p = j.decode(r.json()["access_token"], os.getenv("JWT_SECRET", TEST_JWT_SECRET), algorithms=["HS256"])
        assert p["role"] == "teacher"

    def test_wrong_password_401(self):
        _set("student", data=[_user("student", pw="correct")])
        r = _client.post("/api/auth/login", json={"institution_id": "student001", "password": "WRONG"})
        assert r.status_code == 401

    def test_nonexistent_401(self):
        _set(data=[])
        r = _client.post("/api/auth/login", json={"institution_id": "nobody", "password": "any"})
        assert r.status_code == 401

    def test_missing_institution_id_422(self):
        r = _client.post("/api/auth/login", json={"password": "p"})
        assert r.status_code == 422

    def test_missing_password_422(self):
        r = _client.post("/api/auth/login", json={"institution_id": "x"})
        assert r.status_code == 422

    def test_response_has_user(self):
        _set("admin")
        r = _client.post("/api/auth/login", json={"institution_id": "admin001", "password": TEST_PASSWORD})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

class TestMe:
    def test_valid_token_200(self):
        u = _user("teacher")
        _set("teacher", data=[u])
        r = _client.post("/api/auth/login", json={"institution_id": "teacher001", "password": TEST_PASSWORD})
        assert r.status_code == 200, f"Login failed: {r.json()}"
        tok = r.json()["access_token"]
        _set("teacher", data=[u])
        r2 = _client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert r2.status_code == 200

    def test_no_token_auth_error(self):
        r = _client.get("/api/auth/me")
        assert r.status_code in [401, 403]

    def test_fake_token_401(self):
        r = _client.get("/api/auth/me", headers={"Authorization": "Bearer fake.token.here"})
        assert r.status_code == 401

    def test_expired_token_401(self):
        from jose import jwt as j
        from datetime import datetime, timedelta, timezone
        tok = j.encode({"user_id": "x", "role": "student", "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
                       os.getenv("JWT_SECRET", TEST_JWT_SECRET), algorithm="HS256")
        r = _client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 401
