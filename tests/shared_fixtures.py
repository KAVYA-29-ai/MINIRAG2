import os
from unittest.mock import MagicMock
from passlib.context import CryptContext

# Imported from conftest (already patched and imported)
import conftest as _c
mock_sb = _c.mock_sb
fake_get_supabase = _c.fake_get_supabase
client = _c.client

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
TEST_PASSWORD = "testpass123"  # NOSONAR - test credential only
TEST_JWT_SECRET = "your-secret-key"  # NOSONAR - test secret only


def _hashed(plain):
    return _pwd.hash(plain)


def _jwt(role="student"):
    """Build a signed JWT. institution_id = '{role}001' to match make_user()."""
    from jose import jwt as jose_jwt
    from datetime import datetime, timedelta
    return jose_jwt.encode(
        {
            "user_id": f"uuid-{role}",
            "institution_id": f"{role}001",   # MUST match make_user()
            "role": role,
            "exp": datetime.utcnow() + timedelta(minutes=60),
        },
        os.getenv("JWT_SECRET", TEST_JWT_SECRET),
        algorithm="HS256",
    )


def auth(role="student"):
    return {"Authorization": f"Bearer {_jwt(role)}"}


def make_user(role="student", password=TEST_PASSWORD):
    """institution_id = '{role}001' — must match _jwt()."""
    return {
        "id": f"uuid-{role}",
        "name": f"{role.title()} User",
        "institution_id": f"{role}001",   # MUST match _jwt()
        "email": f"{role}@test.com",
        "role": role,
        "avatar": "male",
        "status": "active",
        "password_hash": _hashed(password),
    }


def mock_user(role="student"):
    """Mock the get_current_user DB fetch."""
    mock_sb.table.return_value \
           .select.return_value \
           .eq.return_value \
           .limit.return_value \
           .execute.return_value = MagicMock(data=[make_user(role)])
