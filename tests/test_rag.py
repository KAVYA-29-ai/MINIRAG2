import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_rag_search():
    response = client.post("/api/rag/search", json={
        "query": "What is AI?",
        "language": "english"
    })
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert "generated_answer" in data

# PDF upload test would require authentication and a sample PDF file
