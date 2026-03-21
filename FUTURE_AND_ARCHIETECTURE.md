# 🚀 EduRag — Future Scope, Architecture & Team Discussion

> This document covers the **framework architecture**, **how the system works end-to-end**, **future scope** (Google Auth, Forget Password, and more), and **team discussion points**.

---

## Table of Contents

- [System Architecture (Detailed)](#-system-architecture-detailed)
- [How the System Works](#-how-the-system-works)
- [RAG Pipeline Deep Dive](#-rag-pipeline-deep-dive)
- [Authentication Flow](#-authentication-flow)
- [Future Scope](#-future-scope)
- [Team Discussion Points](#-team-discussion-points)
- [Priority Roadmap](#-priority-roadmap)

---

## 🏗 System Architecture (Detailed)

### High-Level Overview

EduRag follows a **3-tier serverless architecture**:

```
┌────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                              │
│                                                                    │
│   Browser (React 18 SPA)                                          │
│   ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐  │
│   │  HomePage   │ │ LoginPage  │ │ StudentDash│ │ TeacherDash  │  │
│   └────────────┘ └────────────┘ └────────────┘ └──────────────┘  │
│   ┌────────────┐ ┌────────────────────────────────────────────┐   │
│   │ AdminDash  │ │ api.js — Centralized API Service Layer     │   │
│   └────────────┘ └────────────────────────────────────────────┘   │
│                         │                                          │
│                         │ HTTP (fetch)                             │
│                         ▼                                          │
├────────────────────────────────────────────────────────────────────┤
│                         API LAYER                                  │
│                                                                    │
│   Vercel Serverless Function (api/index.py)                       │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │  FastAPI Application (backend/main.py)                    │    │
│   │                                                          │    │
│   │  Middleware:                                             │    │
│   │  ├── CORS (allow Vercel, Codespaces, localhost)          │    │
│   │  └── JWT Authentication (python-jose)                    │    │
│   │                                                          │    │
│   │  Routers:                                                │    │
│   │  ├── /api/auth/*          → auth.py                      │    │
│   │  ├── /api/users/*         → users.py                     │    │
│   │  ├── /api/rag/*           → rag.py                       │    │
│   │  ├── /api/feedback/*      → feedback.py                  │    │
│   │  ├── /api/student-feedback/* → student_feedback.py       │    │
│   │  └── /api/analytics/*     → analytics.py                 │    │
│   │                                                          │    │
│   │  Models: Pydantic v2 (models.py)                         │    │
│   │  DB Client: supabase_lite.py (httpx-based)               │    │
│   └──────────────────────────────────────────────────────────┘    │
│                         │                                          │
│                         │ HTTPS (PostgREST + Storage API)         │
│                         ▼                                          │
├────────────────────────────────────────────────────────────────────┤
│                       DATA LAYER                                   │
│                                                                    │
│   Supabase Cloud                                                  │
│   ┌──────────────────────────────┐  ┌─────────────────────────┐   │
│   │  PostgreSQL Database         │  │  Storage (S3-compatible)│   │
│   │                              │  │                         │   │
│   │  users                       │  │  Bucket: "pdfs"         │   │
│   │  search_history              │  │  • PDF binary files     │   │
│   │  feedback                    │  │  • Private access only  │   │
│   │  student_feedback            │  │                         │   │
│   │  analytics_events            │  └─────────────────────────┘   │
│   │  pdfs                        │                                │
│   │  pdf_chunks                  │  ┌─────────────────────────┐   │
│   │  rag_embeddings              │  │  Row Level Security     │   │
│   │                              │  │  (service role bypass)  │   │
│   └──────────────────────────────┘  └─────────────────────────┘   │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                         AI LAYER                                   │
│                                                                    │
│   Google Gemini AI                                                │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │  gemini-embedding-001     → Text embedding (768-dim)      │    │
│   │  gemini-3-flash-preview   → Answer generation (primary)   │    │
│   │  gemini-2.5-flash         → Answer generation (fallback)  │    │
│   │  Multimodal embedding     → Image+text embedding          │    │
│   │  Vision captioning        → Image description for PDFs    │    │
│   └──────────────────────────────────────────────────────────┘    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Component Interactions

```
User Action           Frontend (React)         Backend (FastAPI)         Supabase          Gemini AI
───────────           ────────────────         ─────────────────         ────────          ─────────

Login                 POST /api/auth/login  →  Verify password hash  →  Query users table
                      ← JWT token + user       ← User row

RAG Search            POST /api/rag/search →   Embed query          →                     → gemini-embedding-001
                                               Fetch all embeddings →  rag_embeddings
                                               Cosine similarity      (in-memory)
                                               Top-K chunks         →  pdf_chunks
                                               Generate answer      →                     → gemini-3-flash
                      ← AI answer + sources    Log to search_history→  search_history

PDF Upload            POST /api/rag/upload →   Save file to storage →  Storage bucket
                                               Save metadata        →  pdfs table
                      ← PDF record

PDF Indexing          POST /api/rag/index  →   Download from storage←  Storage bucket
                                               Extract text+images    (pypdf)
                                               Chunk text (900 char)
                                               Embed each chunk     →                     → gemini-embedding-001
                                               Caption images       →                     → gemini-vision
                                               Store chunks         →  pdf_chunks
                                               Store embeddings     →  rag_embeddings
                      ← Indexing complete       Update pdf status    →  pdfs.status
```

---

## ⚙️ How the System Works

### 1. User Registration & Authentication

```
Registration Flow:
─────────────────
1. User fills form: name, institution_id, email, password, avatar, role
2. Frontend sends POST /api/auth/register
3. Backend checks for duplicate institution_id in Supabase
4. Password is hashed using bcrypt (passlib)
5. User row inserted into Supabase `users` table
6. JWT token created with user_id, institution_id, role
7. Token + user data returned to frontend
8. Frontend stores token in localStorage

Login Flow:
───────────
1. User enters institution_id + password
2. Backend fetches user by institution_id from Supabase
3. bcrypt.verify(plain_password, stored_hash)
4. If valid → create JWT token (expires in 60 min)
5. Return token + user object
6. Frontend stores in localStorage, redirects to dashboard
```

### 2. PDF Upload & Indexing Pipeline

```
Upload:
───────
1. Teacher/Admin uploads PDF via dashboard
2. File sent as multipart form data to POST /api/rag/upload
3. Backend uploads binary to Supabase Storage (bucket: "pdfs")
4. Metadata row created in `pdfs` table (status: "pending_indexing")

Indexing:
─────────
1. Teacher clicks "Index" button → POST /api/rag/index/{pdf_id}
2. Backend downloads PDF from Supabase Storage to temp file
3. pypdf extracts:
   - Text from each page
   - Images from each page
4. Text is split into overlapping chunks:
   - Chunk size: 900 characters
   - Overlap: 120 characters
   - This ensures no context is lost at chunk boundaries
5. For each text chunk:
   a. Store chunk in `pdf_chunks` table
   b. Generate embedding via Gemini (gemini-embedding-001) → 768-dim vector
   c. Store embedding JSON in `rag_embeddings` table
6. For each page image:
   a. Caption image using Gemini Vision
   b. Create a text chunk from caption
   c. Embed the caption text
   d. (Optional) Multimodal embedding if model available
7. Update `pdfs.status` to "indexed"
8. Update `pdfs.total_chunks` count
```

### 3. RAG Search Pipeline (Core)

```
Step 1: Query Embedding
───────────────────────
User query: "What is Object Oriented Programming?"
  ↓
Gemini embeds query → 768-dimensional vector

Step 2: Vector Retrieval
────────────────────────
Fetch ALL embeddings from `rag_embeddings` table
(currently in-memory cosine similarity — no pgvector yet)

Step 3: Cosine Similarity Ranking
──────────────────────────────────
For each stored embedding:
  similarity = dot(query_vec, chunk_vec) / (|query_vec| × |chunk_vec|)
Sort by similarity descending
Take top-K results (K = 5-10)

Step 4: Context Assembly
────────────────────────
Fetch full text content of top-K chunks from `pdf_chunks`
Assemble context string with source file + page number

Step 5: AI Answer Generation
─────────────────────────────
Prompt to Gemini (gemini-3-flash-preview):
  "You are an educational assistant. Using ONLY the context below,
   answer the student's question. Cite sources.

   Context:
   [Chunk 1 from file.pdf, page 3]
   [Chunk 2 from file.pdf, page 7]
   ...

   Question: What is Object Oriented Programming?"

  ↓
Gemini generates answer with citations

Step 6: Response & Logging
──────────────────────────
Return: { answer, sources[], response_time_ms }
Log to `search_history`: user_id, query, language, results_count, response_time
```

### 4. Analytics System

```
Data Collection:
─ Every RAG search → search_history row (auto)
─ Every event → analytics_events row (optional)

Analytics Endpoints:
─ /summary         → total users, searches, PDFs, today's activity
─ /usage-by-role   → % searches by student vs teacher vs admin
─ /language-usage  → distribution of search languages
─ /daily-queries   → query count per day (last 30 days)
─ /student-insights → trending topics via Gemini analysis
```

### 5. Feedback System

```
Two Feedback Channels:
──────────────────────

1. Teacher → Admin Feedback
   - Categories: system, feature, content, rag, student, other
   - Status workflow: pending → responded → archived
   - Admin can write responses

2. Student → Teacher Feedback
   - Can be anonymous (is_anonymous flag)
   - Simple message format
   - Teachers see aggregated student feedback
```

---

## 🔮 Future Scope

### 🔐 1. Google OAuth Authentication

**Priority: HIGH**

Currently, EduRag uses institution ID + password for auth. Adding Google OAuth would:

- **Eliminate password management** — no bcrypt hashing, no password resets needed
- **Single Sign-On (SSO)** — students/teachers log in with their Google institutional accounts
- **Verified emails** — Google provides verified email addresses automatically
- **Faster onboarding** — one-click login instead of registration form

**Implementation Plan:**
```
Frontend:
  - Add "Sign in with Google" button on LoginRegister page
  - Use Google Identity Services (GIS) library
  - Get ID token from Google

Backend:
  - New endpoint: POST /api/auth/google
  - Verify Google ID token using google-auth library
  - Extract: email, name, picture from Google profile
  - Create or link user in Supabase `users` table
  - Issue JWT token (same as current flow)

Database:
  - Add `google_id` column to users table
  - Add `auth_provider` column (local / google)
  - Make password_hash nullable (Google users don't need it)
```

**Dependencies:**
- `google-auth` Python library
- Google Cloud Console project with OAuth 2.0 credentials
- Authorized redirect URIs for Vercel domain

---

### 🔑 2. Forgot Password / Password Reset

**Priority: HIGH**

Currently, there's no way for users to reset their password if forgotten.

**Implementation Plan:**
```
Option A: Email-Based Reset (Recommended)
──────────────────────────────────────────
1. User clicks "Forgot Password?" on login page
2. Enters their institution_id or email
3. Backend generates a time-limited reset token (JWT, 15 min expiry)
4. Email sent with reset link: /reset-password?token=xxx
5. User clicks link → enters new password
6. Backend verifies token, updates password_hash in Supabase

Option B: OTP-Based Reset
─────────────────────────
1. User requests OTP via email
2. 6-digit code generated, stored temporarily
3. User enters OTP on verification page
4. If valid → allow password change

Required:
- Email service (SendGrid, Resend, or Supabase Auth)
- New table or field: password_reset_tokens
- New endpoints: POST /api/auth/forgot-password, POST /api/auth/reset-password
- New frontend page: ResetPassword.js
```

---

### 📧 3. Email Verification on Registration

**Priority: MEDIUM**

Verify user email addresses during registration to ensure legitimacy.

**Implementation Plan:**
- On register → generate verification token, send email
- User clicks verification link → backend marks email as verified
- Add `email_verified` boolean column to `users` table
- Optionally restrict certain features until verified

---

### 🔍 4. pgvector for Native Vector Search

**Priority: HIGH**

Currently, embeddings are stored as JSON text and similarity is computed in-memory (Python). This doesn't scale.

**Implementation Plan:**
```
Migration:
1. Enable pgvector extension in Supabase: CREATE EXTENSION vector;
2. Add vector column: ALTER TABLE rag_embeddings ADD COLUMN embedding vector(768);
3. Create index: CREATE INDEX ON rag_embeddings USING ivfflat (embedding vector_cosine_ops);
4. Migrate existing JSON embeddings to vector column

Search Query (SQL):
  SELECT *, 1 - (embedding <=> query_vector) AS similarity
  FROM rag_embeddings
  ORDER BY embedding <=> query_vector
  LIMIT 10;

Benefits:
- 100x faster search at scale
- Native PostgreSQL — no Python computation
- Supports millions of embeddings
```

---

### 📱 5. Mobile-Responsive UI / PWA

**Priority: MEDIUM**

Make the platform fully responsive and installable as a Progressive Web App.

- Responsive CSS for all dashboard pages
- PWA manifest and service worker
- Offline caching for previously viewed content
- Push notifications for feedback responses

---

### 💬 6. Real-Time Features (Supabase Realtime)

**Priority: MEDIUM**

Use Supabase Realtime subscriptions for:
- Live feedback notifications (teacher gets notified when student submits)
- Real-time analytics dashboard updates
- Live search activity feed for admins
- Online status indicators for buddies

---

### 📝 7. Quiz & Assessment Generation

**Priority: LOW**

Use Gemini to auto-generate quizzes from uploaded PDFs:
- Teacher selects a PDF → "Generate Quiz"
- Gemini reads content and creates MCQs, true/false, short answer questions
- Students take quizzes through the platform
- Auto-grading for objective questions
- New tables: `quizzes`, `quiz_questions`, `quiz_attempts`

---
