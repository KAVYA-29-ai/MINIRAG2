# 05 — Implementation Flow

This section describes the step-by-step flow from raw document ingestion to answering a user query.

1) Document ingestion
- Extract text from documents (PDFs, Markdown, HTML), normalize and split into passages.

2) Embedding generation
- Convert passages to vector embeddings using an embeddings model (e.g., OpenAI embeddings).

3) Vector store
- Store embeddings with document metadata into the vector store (id, doc_id, chunk_text, source_url).

4) Query handling
- User submits a query.
- Backend generates query embedding and queries the vector store for top-K similar passages.

5) LLM synthesis
- Retrieved passages are composed into a prompt and sent to the LLM to generate an answer with citations.

6) Feedback & iteration
- Users can rate answers or provide corrections; feedback is stored and used to retrain ranking or reweight sources.

Implementation tips
- Keep passage length consistent for better retrieval quality.
- Store provenance (document name, section, URL) for every passage.
