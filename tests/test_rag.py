import os, pytest, io
from unittest.mock import MagicMock, patch
import _mock_setup as _ms

_mock_sb = _ms.mock_sb
_client = _ms.client

from passlib.context import CryptContext
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def _user(role="student"):
    return {"id": f"uuid-{role}", "name": f"{role} user",
            "institution_id": f"{role}001", "email": f"{role}@t.com",
            "role": role, "avatar": "male", "status": "active",
            "password_hash": _pwd.hash("testpass123")}

def _jwt(role="student"):
    from jose import jwt as j
    from datetime import datetime, timedelta, timezone
    return j.encode({"user_id": f"uuid-{role}", "institution_id": f"{role}001",
                     "role": role, "exp": datetime.now(timezone.utc) + timedelta(minutes=60)},
                    os.getenv("JWT_SECRET", "your-secret-key"), algorithm="HS256")

def _auth(role="student"):
    return {"Authorization": f"Bearer {_jwt(role)}"}

def _su(role="student"):
    _mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[_user(role)])

def _chunk():
    return {"id": "c1", "content": "Neural nets learn.", "source_file": "ml.pdf", "page_number": 1}

def _emb():
    import json
    return {"id": "e1", "pdf_chunk_id": "c1", "modality": "text", "embedding_json": json.dumps([0.9]*768)}

@pytest.fixture(autouse=True)
def _reset():
    _mock_sb.reset_mock()
    _ms._main._ip_buckets.clear()
    _mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
    _mock_sb.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
    _mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])
    yield

class TestRAGSearch:
    def test_no_token_auth_error(self):
        r = _client.post("/api/rag/search", json={"query": "test"})
        assert r.status_code in [401, 403]

    def test_missing_query_422(self):
        _su()
        r = _client.post("/api/rag/search", json={}, headers=_auth())
        assert r.status_code == 422

    def test_search_200(self):
        _su()
        with patch("routers.rag._embed_text", return_value=[0.9]*768), \
             patch("routers.rag._generate_rag_answer", return_value="Answer."), \
             patch("routers.rag._get_gemini_client", return_value=MagicMock()):
            _mock_sb.table.return_value.select.return_value.execute.return_value = MagicMock(data=[_emb()])
            _mock_sb.table.return_value.select.return_value.in_.return_value.execute.return_value = MagicMock(data=[_chunk()])
            _mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])
            r = _client.post("/api/rag/search", json={"query": "neural"}, headers=_auth())
        assert r.status_code == 200
        assert "results" in r.json() and "generated_answer" in r.json()

    def test_empty_query_never_500(self):
        _su()
        with patch("routers.rag._embed_text", return_value=None), \
             patch("routers.rag._get_gemini_client", return_value=None):
            _mock_sb.table.return_value.select.return_value.execute.return_value = MagicMock(data=[])
            _mock_sb.table.return_value.select.return_value.ilike.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
            _mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])
            r = _client.post("/api/rag/search", json={"query": ""}, headers=_auth())
        assert r.status_code in [200, 400, 422] and r.status_code != 500

    def test_no_results_200(self):
        _su()
        with patch("routers.rag._embed_text", return_value=[0.1]*768), \
             patch("routers.rag._get_gemini_client", return_value=MagicMock()):
            _mock_sb.table.return_value.select.return_value.execute.return_value = MagicMock(data=[])
            _mock_sb.table.return_value.select.return_value.ilike.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
            _mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])
            r = _client.post("/api/rag/search", json={"query": "xyzzy"}, headers=_auth())
        assert r.status_code == 200

    def test_response_keys(self):
        _su()
        with patch("routers.rag._embed_text", return_value=[0.1]*768), \
             patch("routers.rag._get_gemini_client", return_value=MagicMock()):
            _mock_sb.table.return_value.select.return_value.execute.return_value = MagicMock(data=[])
            _mock_sb.table.return_value.select.return_value.ilike.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
            _mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])
            r = _client.post("/api/rag/search", json={"query": "ML"}, headers=_auth())
        assert r.status_code == 200
        for k in ["query", "results", "generated_answer"]:
            assert k in r.json()

class TestPDFUpload:
    def test_no_token_auth_error(self):
        r = _client.post("/api/rag/upload-pdf", files={"file": ("t.pdf", io.BytesIO(b"%PDF"), "application/pdf")})
        assert r.status_code in [401, 403]

    def test_non_pdf_400(self):
        _su("teacher")
        r = _client.post("/api/rag/upload-pdf",
                         files={"file": ("notes.txt", io.BytesIO(b"text"), "text/plain")},
                         headers=_auth("teacher"))
        assert r.status_code == 400

    def test_student_forbidden_403(self):
        _su("student")
        r = _client.post("/api/rag/upload-pdf",
                         files={"file": ("t.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
                         headers=_auth("student"))
        assert r.status_code == 403

    def test_teacher_upload_200(self):
        _su("teacher")
        _mock_sb.storage.from_.return_value.upload.return_value = {"Key": "pdfs/t.pdf"}
        _mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": 1, "filename": "t.pdf", "status": "pending_indexing"}])
        with patch("routers.rag._ensure_storage_bucket", return_value=None):
            r = _client.post("/api/rag/upload-pdf",
                             files={"file": ("t.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
                             headers=_auth("teacher"))
        assert r.status_code == 200

class TestPDFList:
    def test_no_token_auth_error(self):
        r = _client.get("/api/rag/pdfs")
        assert r.status_code in [401, 403]

    def test_returns_list(self):
        _su()
        _mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value = MagicMock(data=[
            {"id": 1, "filename": "ml.pdf", "status": "indexed",
             "total_pages": 5, "total_chunks": 20, "uploaded_by": "uuid-student", "created_at": "2026-01-01"}
        ])
        r = _client.get("/api/rag/pdfs", headers=_auth())
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_item_structure(self):
        _su()
        _mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value = MagicMock(data=[
            {"id": 1, "filename": "ml.pdf", "status": "indexed",
             "total_pages": 5, "total_chunks": 20, "uploaded_by": "uuid-student", "created_at": "2026-01-01"}
        ])
        r = _client.get("/api/rag/pdfs", headers=_auth())
        assert r.status_code == 200
        if r.json():
            assert "id" in r.json()[0] and "filename" in r.json()[0]

class TestSearchHistory:
    def _setup(self, data):
        _su("student")
        _mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[_user("student")])
        _mock_sb.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=data)

    def test_no_token_auth_error(self):
        r = _client.get("/api/rag/search-history")
        assert r.status_code in [401, 403]

    def test_returns_list(self):
        self._setup([{"id": "h1", "query": "RAG", "language": "en", "results_count": 3, "created_at": "2026-01-01T10:00:00"}])
        r = _client.get("/api/rag/search-history", headers=_auth())
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert r.json()[0]["query"] == "RAG"

    def test_filters_by_user(self):
        self._setup([])
        r = _client.get("/api/rag/search-history", headers=_auth())
        assert r.status_code == 200
        _mock_sb.table.return_value.select.return_value.eq.assert_called()

    def test_empty_returns_list(self):
        self._setup([])
        r = _client.get("/api/rag/search-history", headers=_auth())
        assert r.status_code == 200
        assert isinstance(r.json(), list)
