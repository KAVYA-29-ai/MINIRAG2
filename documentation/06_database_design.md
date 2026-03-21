# 06 — Database Design

This section outlines the main tables and fields used by MINIRAG2.

Tables (suggested)

- `users`
  - `id` (PK)
  - `email`
  - `hashed_password`
  - `role` (student|teacher|admin)
  - `created_at`

- `documents`
  - `id` (PK)
  - `title`
  - `source_url`
  - `uploaded_by`
  - `created_at`

- `passages` (text chunks)
  - `id` (PK)
  - `document_id` (FK -> documents.id)
  - `text`
  - `chunk_index`
  - `metadata` (json)

- `embeddings`
  - `id` (PK)
  - `passage_id` (FK -> passages.id)
  - `vector` (vector column or external vector id)
  - `created_at`

- `feedback`
  - `id` (PK)
  - `user_id` (FK)
  - `query`
  - `response`
  - `rating` (1-5)
  - `comment`
  - `created_at`

- `analytics`
  - `id` (PK)
  - `event_type` (query|click|rating)
  - `payload` (json)
  - `created_at`

Indexing and performance
- Index `passages` by `document_id` and create a full-text search index for fallback queries.
- Store vectors in a vector-typed column if supported (Postgres + pgvector) for nearest-neighbour queries.
