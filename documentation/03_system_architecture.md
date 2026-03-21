# 03 — System Architecture

This document explains the components, responsibilities and request flow for MINIRAG2.

Components
- Frontend (React): UI, query input, result rendering, feedback collection.
- Backend (FastAPI / Python): API endpoints, RAG orchestration, auth, feedback persistence.
- Vector store / embeddings: stores document vectors for similarity search.
- LLM provider: generates synthesized answers from retrieved context.
- Database (Supabase/Postgres): stores users, documents metadata, feedback and analytics.

High-level data flow

```mermaid
flowchart LR
  U[User] -->|query| F(Frontend)
  F -->|POST /api/rag| B(Backend)
  B -->|retrieve| V[Vector Store]
  B -->|fetch metadata| DB[(Supabase/Postgres)]
  B -->|prompt| LLM[LLM provider]
  LLM --> B
  B --> F
```

Scaling notes
- Separate vector store (managed service) for large datasets.
- Cache frequent queries and LLM responses.
- Use async calls and batching for embeddings and LLM calls.
