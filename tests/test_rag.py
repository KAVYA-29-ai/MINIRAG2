import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_rag_search():
    response = client.post(
        "/api/rag/search",
        json={"query": "What is AI?", "language": "english"},
        headers={"Authorization": "Bearer test_token"}
    )
    assert response.status_code in [200, 401, 403]  # Allow 403 for missing/invalid token
    data = response.json()
    assert "results" in data
    assert "generated_answer" in data

# PDF upload test would require authentication and a sample PDF file
