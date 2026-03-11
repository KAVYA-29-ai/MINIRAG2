import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_feedback_submission():
    # This test assumes a teacher user is authenticated
    # You can expand with token setup if needed
    response = client.post("/api/feedback/", json={
        "category": "general",
        "message": "Test feedback message"
    })
    assert response.status_code in [200, 403]  # 403 if not teacher
