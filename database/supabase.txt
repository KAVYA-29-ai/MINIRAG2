-- =============================================
-- EduRag — Supabase SQL Schema
-- Run this in your Supabase SQL Editor
--
-- ALSO: Go to Supabase Dashboard → Storage
--       and create a bucket named "pdfs" (private)
-- =============================================

-- 1) Users
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    institution_id VARCHAR(50) UNIQUE NOT NULL,
    email         VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  DEFAULT 'student'  CHECK (role   IN ('student','teacher','admin')),
    avatar        VARCHAR(20)  DEFAULT 'male'     CHECK (avatar IN ('male','female')),
    status        VARCHAR(20)  DEFAULT 'active'   CHECK (status IN ('active','inactive')),
    created_at    TIMESTAMPTZ  DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_institution_id ON users(institution_id);
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role           ON users(role);

-- 2) Search History
CREATE TABLE IF NOT EXISTS search_history (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    query           TEXT NOT NULL,
    language        VARCHAR(20)  DEFAULT 'english',
    results_count   INTEGER      DEFAULT 0,
    response_time_ms INTEGER,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sh_user    ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_sh_created ON search_history(created_at DESC);

-- 3) Feedback (Teacher → Admin)
CREATE TABLE IF NOT EXISTS feedback (
    id              SERIAL PRIMARY KEY,
    sender_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category        VARCHAR(30) CHECK (category IN ('system','feature','content','rag','student','other')),
    message         TEXT NOT NULL,
    status          VARCHAR(20)  DEFAULT 'pending' CHECK (status IN ('pending','responded','archived')),
    admin_response  TEXT,
    responded_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    responded_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fb_sender ON feedback(sender_id);
CREATE INDEX IF NOT EXISTS idx_fb_status ON feedback(status);

-- 4) Student Feedback (anonymous option)
CREATE TABLE IF NOT EXISTS student_feedback (
    id           SERIAL PRIMARY KEY,
    sender_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_anonymous BOOLEAN DEFAULT false,
    message      TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 5) Analytics Events
CREATE TABLE IF NOT EXISTS analytics_events (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type  VARCHAR(50) NOT NULL,
    event_data  JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ae_type    ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ae_created ON analytics_events(created_at DESC);

-- 6) PDFs (uploaded documents — files stored in Supabase Storage bucket "pdfs")
CREATE TABLE IF NOT EXISTS pdfs (
    id            SERIAL PRIMARY KEY,
    filename      VARCHAR(255) NOT NULL,
    storage_path  VARCHAR(500) NOT NULL,   -- key inside Supabase Storage bucket
    uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status        VARCHAR(30)  DEFAULT 'pending_indexing'
                  CHECK (status IN ('pending_indexing','indexing','indexed','failed')),
    total_pages   INTEGER,
    total_chunks  INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdfs_status      ON pdfs(status);
CREATE INDEX IF NOT EXISTS idx_pdfs_uploaded_by  ON pdfs(uploaded_by);

-- 7) PDF Chunks (text segments for RAG)
CREATE TABLE IF NOT EXISTS pdf_chunks (
    id           SERIAL PRIMARY KEY,
    pdf_id       INTEGER REFERENCES pdfs(id) ON DELETE CASCADE,
    content      TEXT NOT NULL,
    source_file  VARCHAR(255) NOT NULL,
    page_number  INTEGER,
    chunk_index  INTEGER,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pc_pdf ON pdf_chunks(pdf_id);

-- 8) RAG Embeddings (vector stored as JSON text)
CREATE TABLE IF NOT EXISTS rag_embeddings (
    id             SERIAL PRIMARY KEY,
    pdf_id         INTEGER REFERENCES pdfs(id) ON DELETE CASCADE NOT NULL,
    pdf_chunk_id   INTEGER REFERENCES pdf_chunks(id) ON DELETE CASCADE NOT NULL,
    modality       VARCHAR(20)  DEFAULT 'text' NOT NULL,
    embedding_json TEXT NOT NULL,
    page_number    INTEGER,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_re_pdf   ON rag_embeddings(pdf_id);
CREATE INDEX IF NOT EXISTS idx_re_chunk ON rag_embeddings(pdf_chunk_id);

-- =============================================
-- Row Level Security — service role key bypasses
-- RLS, so these policies allow full access for
-- the backend. All 8 tables covered.
-- =============================================
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback          ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_feedback  ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdfs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_chunks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_embeddings    ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (backend uses service role key)
CREATE POLICY "Service role full access" ON users            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON search_history   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON feedback         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON student_feedback FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON analytics_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON pdfs             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON pdf_chunks       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON rag_embeddings   FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- Storage bucket for PDF files
-- NOTE: Also create this manually in Supabase
-- Dashboard → Storage → New Bucket → "pdfs" (private)
-- OR run this (works in SQL editor):
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs', 'pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Allow service role to manage files in the pdfs bucket
CREATE POLICY "Service role storage access"
ON storage.objects FOR ALL
USING (bucket_id = 'pdfs')
WITH CHECK (bucket_id = 'pdfs');
