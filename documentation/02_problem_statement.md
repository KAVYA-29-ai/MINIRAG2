# 02 — Problem Statement

Organizations have growing volumes of documents (policies, manuals, knowledge bases). Simple keyword search returns low-quality results and often requires manual synthesis by experts.

Problems addressed
- Users need fast, accurate answers with source citations.
- Knowledge spreads across multiple formats and storage locations.
- Lack of feedback loop to correct or improve answers over time.

How MINIRAG2 helps
- Uses semantic embeddings and vector search to retrieve relevant passages.
- Uses an LLM to synthesize answers and attach source excerpts.
- Collects user feedback to improve retrieval and ranking.

Success criteria
- Answer accuracy (measured via user feedback and tests).
- Latency under acceptable thresholds for interactive use.
- Clear provenance (source citations) for each answer.
