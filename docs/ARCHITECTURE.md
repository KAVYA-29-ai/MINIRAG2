# EduRag Architecture

This document describes the backend layering, database schema, and end-to-end data flow used in EduRag.

## System Overview

EduRag is a full-stack RAG platform with:
- React frontend (SPA)
- FastAPI backend (API + auth + orchestration)
- Supabase PostgreSQL and Storage
- Google Gemini for embedding and generation

## Layered Backend Design

| Layer | Path | Responsibility |
|---|---|---|
| API Transport | `backend/routers/` | HTTP routes, request parsing, response mapping |
| Core Security | `backend/core/` | RBAC and shared rate limiter utilities |
| Business Services | `backend/services/` | Reusable domain logic (chat operations, realtime manager) |
| Data Access | `backend/database.py`, `backend/supabase_lite.py` | Supabase client initialization and query helpers |
| Validation Models | `backend/models.py` | Pydantic schemas and sanitization rules |

## Database Schema (Supabase)

| Table | Purpose | Key Fields |
|---|---|---|
| `users` | User accounts and roles | `id`, `institution_id`, `password_hash`, `role`, `status` |
| `search_history` | Query history and performance logs | `id`, `user_id`, `query`, `language`, `results_count`, `created_at` |
| `feedback` | Teacher-to-admin feedback threads | `id`, `sender_id`, `category`, `message`, `status`, `admin_response` |
| `student_feedback` | Student feedback (optionally anonymous) | `id`, `student_id`, `message`, `is_anonymous`, `created_at` |
| `analytics_events` | Usage tracking events | `id`, `user_id`, `event_type`, `payload`, `created_at` |
| `pdfs` | Uploaded PDF metadata | `id`, `filename`, `status`, `uploaded_by`, `created_at` |
| `pdf_chunks` | Extracted text chunks | `id`, `pdf_id`, `content`, `page_number` |
| `rag_embeddings` | Vector embeddings for retrieval | `id`, `pdf_chunk_id`, `embedding_json`, `modality` |

Storage bucket: `pdfs` (private)

## Data Flow

### 1. Authentication Flow
1. Client submits register/login request.
2. Backend validates payload via Pydantic models.
3. Password is hashed/verified with bcrypt.
4. JWT is issued and used for subsequent API calls.
5. RBAC checks role permissions on protected endpoints.

### 2. PDF Ingestion Flow
1. Teacher/admin uploads a PDF.
2. File is stored in Supabase Storage (`pdfs` bucket).
3. Text/images are extracted and chunked.
4. Gemini embedding model creates vectors for chunks.
5. Chunk metadata and embeddings are stored in Supabase tables.

### 3. RAG Query Flow
1. User submits question to `/api/rag/search`.
2. Query embedding is generated.
3. Candidate chunks are fetched and ranked by similarity.
4. Top context is passed to Gemini generation model.
5. Answer + sources are returned; search is logged.

### 4. Analytics Flow
1. Search and interaction records are collected.
2. Analytics endpoints aggregate counts by role/date/language.
3. Dashboard consumes these endpoints for insights.

## Security Controls

- JWT auth with role-based access control (RBAC)
- SlowAPI rate limiting (global + auth endpoint specific)
- Input sanitization using `bleach.clean()` in model hygiene
- Strict CORS allowlist via `FRONTEND_URL`
- `TrustedHostMiddleware` for host header hardening

## Deployment Model

- Frontend: Vercel static build
- Backend: Vercel Python serverless runtime
- Database and storage: Supabase managed services
