# 07 — API Reference

Auth
- `POST /api/auth/login`
  - Body: `{ "email": "...", "password": "..." }`
  - Returns: `{ "access_token": "...", "token_type": "bearer" }`

- `POST /api/auth/register`
  - Body: `{ "email":"...","password":"...","role":"student" }`

RAG / Search
- `POST /api/rag`
  - Headers: `Authorization: Bearer <token>` (if protected)
  - Body: `{ "query": "string", "top_k": 5 }`
  - Response example:

```json
{
  "answer": "...",
  "sources": [ { "id":"passage-1","score":0.82,"text":"excerpt" } ]
}
```

Feedback
- `POST /api/feedback`
  - Body: `{ "user_id": 123, "message": "...", "rating": 4 }`

Analytics
- `GET /api/analytics/usage` — protected; returns aggregated metrics.

Example curl requests

```bash
curl -X POST http://localhost:8000/api/rag \
  -H "Content-Type: application/json" \
  -d '{"query":"How to reset password","top_k":3}'
```

Authentication note
- Verify whether the backend expects cookie-based sessions or Bearer tokens and adjust `Authorization` headers accordingly. Inspect `backend/routers/auth.py` for exact behavior.
