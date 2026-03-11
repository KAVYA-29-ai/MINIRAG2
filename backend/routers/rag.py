"""
RAG Router - Document Search and PDF Management
100% Supabase — no local storage at all.
PDFs uploaded to Supabase Storage bucket "pdfs".
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import List, Optional
from datetime import datetime
import os
import time
import json
import math
import tempfile

from models import RAGQuery
from database import get_supabase
from routers.auth import get_current_user

router = APIRouter()

STORAGE_BUCKET = "pdfs"   # Supabase Storage bucket name

EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
MULTIMODAL_EMBEDDING_MODEL = os.getenv("GEMINI_MULTIMODAL_EMBEDDING_MODEL", "")
GENERATION_MODEL = os.getenv("GEMINI_GENERATION_MODEL", "models/gemini-3-flash-preview")
GENERATION_MODEL_FALLBACK = os.getenv("GEMINI_GENERATION_MODEL_FALLBACK", "models/gemini-2.5-flash")


def _get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None
    try:
        from google import genai
        return genai.Client(api_key=api_key)
    except Exception:
        return None
    """
    Initialize and return a Gemini API client using the API key from environment variables.
    Returns None if the API key is not set or the client cannot be created.
    """


def _safe_mime_type(image_bytes: bytes) -> str:
    if image_bytes.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if image_bytes.startswith(b"\x89PNG"):
        return "image/png"
    if image_bytes.startswith(b"GIF8"):
        return "image/gif"
    return "application/octet-stream"
    """
    Detect the MIME type of image bytes (JPEG, PNG, GIF) or return octet-stream as fallback.
    """


def _extract_text_and_images_from_pdf(pdf_path: str):
    """
    Extract text and images from a local PDF file path.
    Returns a list of pages, each with text and images, and the total number of pages.
    """
    pages = []
    try:
        from pypdf import PdfReader
    except Exception as exc:
        raise RuntimeError("pypdf is required for PDF parsing") from exc

    reader = PdfReader(pdf_path)
    for page_number, page in enumerate(reader.pages, start=1):
        page_text = (page.extract_text() or "").strip()
        page_images = []
        try:
            for image_file in getattr(page, "images", []):
                if getattr(image_file, "data", None):
                    page_images.append(image_file.data)
        except Exception:
            page_images = []

        pages.append({
            "page_number": page_number,
            "text": page_text,
            "images": page_images,
        })

    return pages, len(reader.pages)


def _download_pdf_from_storage(sb, storage_path: str) -> str:
    """
    Download a PDF from Supabase Storage to a temporary file.
    Returns the temporary file path.
    """
    data = sb.storage.from_(STORAGE_BUCKET).download(storage_path)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp.write(data)
    tmp.close()
    return tmp.name


def _ensure_storage_bucket(sb):
    """
    Ensure the Supabase storage bucket exists; create it if it does not.
    """
    try:
        sb.storage.get_bucket(STORAGE_BUCKET)
    except Exception:
        try:
            sb.storage.create_bucket(STORAGE_BUCKET, options={"public": False})
        except Exception:
            pass  # bucket may already exist


def _embed_text(client, text: str):
        """
        Generate an embedding vector for the given text using the Gemini client.
        Returns the embedding vector or None if embedding fails.
        """
    if not client or not text.strip():
        return None
    try:
        response = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
        )
        if hasattr(response, "embeddings") and response.embeddings:
            return response.embeddings[0].values
        if hasattr(response, "embedding") and response.embedding:
            return response.embedding.values
    except Exception:
        return None
    return None


def _try_multimodal_embed(client, image_bytes: bytes, page_text: str):
        """
        Generate a multimodal embedding for an image and its associated page text using Gemini.
        Returns the embedding vector or None if not available.
        """
    if not client or not MULTIMODAL_EMBEDDING_MODEL:
        return None
    try:
        mime_type = _safe_mime_type(image_bytes)
        response = client.models.embed_content(
            model=MULTIMODAL_EMBEDDING_MODEL,
            contents=[
                {
                    "parts": [
                        {"text": page_text or "Describe this educational image"},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": image_bytes,
                            }
                        },
                    ]
                }
            ],
        )
        if hasattr(response, "embeddings") and response.embeddings:
            return response.embeddings[0].values
    except Exception:
        return None
    return None


def _caption_image_with_gemini(client, image_bytes: bytes):
        """
        Generate a factual caption for an image using Gemini models.
        Returns the caption string or an empty string if generation fails.
        """
    if not client:
        return ""
    mime_type = _safe_mime_type(image_bytes)

    prompt = (
        "You are helping index educational PDFs for retrieval. "
        "Describe this image in concise, factual terms with learning-relevant details."
    )

    try:
        from google.genai import types
        response = client.models.generate_content(
            model=GENERATION_MODEL,
            contents=[
                prompt,
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            ],
        )
        return (response.text or "").strip()
    except Exception:
        try:
            from google.genai import types
            response = client.models.generate_content(
                model=GENERATION_MODEL_FALLBACK,
                contents=[
                    prompt,
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                ],
            )
            return (response.text or "").strip()
        except Exception:
            return ""


def _chunk_text(raw_text: str, chunk_size: int = 900, overlap: int = 120):
        """
        Split raw text into overlapping chunks for embedding and retrieval.
        Returns a list of text chunks.
        """
    normalized = " ".join(raw_text.split())
    if not normalized:
        return []

    chunks = []
    start_index = 0
    text_length = len(normalized)
    while start_index < text_length:
        end_index = min(start_index + chunk_size, text_length)
        chunk = normalized[start_index:end_index].strip()
        if chunk:
            chunks.append(chunk)
        if end_index == text_length:
            break
        start_index = max(0, end_index - overlap)
    return chunks


def _cosine_similarity(vector_a, vector_b):
        """
        Compute the cosine similarity between two vectors.
        Returns a float between 0.0 and 1.0.
        """
    if not vector_a or not vector_b or len(vector_a) != len(vector_b):
        return 0.0

    dot = sum(a * b for a, b in zip(vector_a, vector_b))
    norm_a = math.sqrt(sum(a * a for a in vector_a))
    norm_b = math.sqrt(sum(b * b for b in vector_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _generate_rag_answer(client, user_query: str, retrieved_results: list):
        """
        Generate an answer to the user query using retrieved context and Gemini models.
        Returns the generated answer as a string.
        """
    if not client or not retrieved_results:
        return "Could not generate an AI answer. Please check that your Gemini API key is configured."

    context_lines = []
    for idx, result in enumerate(retrieved_results[:5], 1):
        source_name = result.get('source', 'Unknown')
        page = result.get('page_number', 1)
        context_lines.append(
            f"[Source {idx}: {source_name}, Page {page}]\n{result['content']}"
        )

    prompt = (
        "You are EduRag, an intelligent educational RAG (Retrieval-Augmented Generation) assistant.\n"
        "Your job is to generate a clear, helpful, and well-structured answer based ONLY on the retrieved context below.\n"
        "IMPORTANT RULES:\n"
        "1. Synthesize the information into a coherent answer — do NOT just copy-paste chunks.\n"
        "2. At the END of your answer, add a 'Sources:' section listing which sources you used "
        "(e.g., 'Sources: Source 1 (filename.pdf, Page 3), Source 2 (filename.pdf, Page 7)').\n"
        "3. If the context does not contain enough info, say so clearly.\n"
        "4. Keep the answer educational, concise, and well-formatted.\n\n"
        f"Student's Question: {user_query}\n\n"
        "Retrieved Context:\n"
        + "\n\n".join(context_lines)
    )

    # Try primary model, then fallback
    for model in [GENERATION_MODEL, GENERATION_MODEL_FALLBACK]:
        try:
            response = client.models.generate_content(model=model, contents=prompt)
            text = (response.text or "").strip()
            if text:
                return text
        except Exception as e:
            print(f"Generation failed with {model}: {e}")
            continue

    # If both models fail, construct a basic answer from chunks
    fallback_text = f"Here is what I found about \"{user_query}\":\n\n"
    for idx, result in enumerate(retrieved_results[:3], 1):
        fallback_text += f"{idx}. {result['content'][:300]}...\n\n"
    fallback_text += "Sources: " + ", ".join(
        f"{r['source']} (Page {r.get('page_number', 1)})" for r in retrieved_results[:3]
    )
    return fallback_text

@router.post("/search")
async def search_documents(
    query: RAGQuery,
    current_user: dict = Depends(get_current_user),
):
    """
    Search documents using Retrieval-Augmented Generation (RAG) from Supabase.
    Returns relevant results and a generated answer.
    """
    start_time = time.time()
    gemini_client = _get_gemini_client()
    retrieval_mode = "keyword"
    used_multimodal = False

    try:
        sb = get_supabase()
        results = []
        query_vector = _embed_text(gemini_client, query.query)

        # Minimum cosine similarity threshold — below this, results are noise
        SIMILARITY_THRESHOLD = 0.65

        if query_vector:
            # Fetch all embeddings with their chunk content via join-like approach
            emb_rows = sb.table("rag_embeddings").select("id, pdf_chunk_id, modality, embedding_json").execute().data or []

            # Batch-fetch all referenced chunks
            chunk_ids = list({r["pdf_chunk_id"] for r in emb_rows if r.get("pdf_chunk_id")})
            chunk_map = {}
            if chunk_ids:
                # Supabase .in_() has a limit; batch if needed
                for i in range(0, len(chunk_ids), 200):
                    batch = chunk_ids[i:i+200]
                    c_resp = sb.table("pdf_chunks").select("id, content, source_file, page_number").in_("id", batch).execute()
                    for c in (c_resp.data or []):
                        chunk_map[c["id"]] = c

            ranked = []
            for emb in emb_rows:
                try:
                    chunk_vector = json.loads(emb["embedding_json"])
                    similarity = _cosine_similarity(query_vector, chunk_vector)
                except Exception:
                    similarity = 0.0

                # Only keep results above the threshold
                if similarity >= SIMILARITY_THRESHOLD:
                    if emb.get("modality") == "multimodal":
                        used_multimodal = True
                    chunk = chunk_map.get(emb["pdf_chunk_id"])
                    if chunk:
                        ranked.append((similarity, chunk))

            ranked.sort(key=lambda item: item[0], reverse=True)
            for similarity, chunk in ranked[:5]:
                results.append({
                    "id": chunk["id"],
                    "content": chunk["content"][:700],
                    "source": chunk["source_file"],
                    "relevance_score": round(float(similarity), 4),
                    "page_number": chunk.get("page_number") or 1,
                })
            if results:
                retrieval_mode = "semantic"

        # Keyword fallback — only if semantic found nothing above threshold
        if not results:
            kw_resp = sb.table("pdf_chunks").select("id, content, source_file, page_number").ilike("content", f"%{query.query}%").limit(5).execute()
            for idx, chunk in enumerate(kw_resp.data or []):
                results.append({
                    "id": chunk["id"],
                    "content": chunk["content"][:700],
                    "source": chunk["source_file"],
                    "relevance_score": 0.90 - (idx * 0.05),
                    "page_number": chunk.get("page_number") or 1,
                })

        if not results:
            generated_answer = f"No relevant results found for \"{query.query}\". The indexed PDFs may not contain information on this topic. Try a different query or ask your teacher to upload relevant course materials."
        else:
            generated_answer = _generate_rag_answer(gemini_client, query.query, results)
        response_time = int((time.time() - start_time) * 1000)

        # Log search history
        try:
            sb.table("search_history").insert({
                "user_id": current_user.get("id"),
                "query": query.query,
                "language": query.language,
                "results_count": len(results),
                "response_time_ms": response_time,
            }).execute()
        except Exception:
            pass

        return {
            "query": query.query,
            "results": results,
            "total_results": len(results),
            "response_time_ms": response_time,
            "retrieval_mode": retrieval_mode,
            "used_multimodal": used_multimodal,
            "generated_answer": generated_answer,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload a PDF file to Supabase Storage (Teacher/Admin only).
    Returns the uploaded PDF's metadata.
    """
    if current_user.get("role") not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Only teachers and admins can upload PDFs")

    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    try:
        sb = get_supabase()
        _ensure_storage_bucket(sb)

        file_bytes = await file.read()
        # Use a unique path to avoid collisions
        storage_path = f"{int(time.time())}_{file.filename}"

        sb.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": "application/pdf"},
        )

        resp = sb.table("pdfs").insert({
            "filename": file.filename,
            "storage_path": storage_path,
            "uploaded_by": current_user.get("id"),
            "status": "pending_indexing",
        }).execute()
        new_pdf = resp.data[0]

        return {
            "message": "PDF uploaded successfully",
            "pdf": {
                "id": new_pdf["id"],
                "filename": new_pdf["filename"],
                "status": new_pdf["status"],
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pdfs")
async def list_pdfs(
    current_user: dict = Depends(get_current_user),
):
    """
    List all uploaded PDFs with their metadata.
    """
    sb = get_supabase()
    resp = sb.table("pdfs").select("*").order("created_at", desc=True).execute()
    return [
        {
            "id": p["id"],
            "filename": p["filename"],
            "status": p["status"],
            "total_pages": p.get("total_pages"),
            "total_chunks": p.get("total_chunks", 0),
            "uploaded_by": p.get("uploaded_by"),
            "created_at": p.get("created_at"),
        }
        for p in (resp.data or [])
    ]

@router.get("/search-history")
async def get_search_history(
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """
    Get the current user's search history from Supabase.
    """
    try:
        sb = get_supabase()
        resp = (
            sb.table("search_history")
            .select("id, query, language, results_count, created_at")
            .eq("user_id", current_user.get("id"))
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return resp.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/trending")
async def get_trending_topics(
    current_user: dict = Depends(get_current_user),
):
    """
    Get trending search topics from Supabase search history.
    Returns a list of topics with their popularity.
    """
    try:
        sb = get_supabase()
        rows = sb.table("search_history").select("query").execute().data or []
        from collections import Counter
        counts = Counter(r["query"] for r in rows if r.get("query"))
        return [
            {"topic": q, "count": c, "difficulty": "High" if c > 40 else "Medium" if c > 20 else "Low"}
            for q, c in counts.most_common(10)
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/pdfs/{pdf_id}")
async def delete_pdf(
    pdf_id: int,
    current_user: dict = Depends(get_current_user),
):
    """
    Delete a PDF from Supabase Storage and database (Teacher/Admin only).
    """
    if current_user.get("role") not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Only teachers and admins can delete PDFs")

    sb = get_supabase()
    resp = sb.table("pdfs").select("*").eq("id", pdf_id).limit(1).execute()
    pdf = resp.data[0] if resp.data else None
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    # Delete from Supabase Storage
    if pdf.get("storage_path"):
        try:
            sb.storage.from_(STORAGE_BUCKET).remove([pdf["storage_path"]])
        except Exception:
            pass

    # Cascade: delete embeddings → chunks → pdf row
    sb.table("rag_embeddings").delete().eq("pdf_id", pdf_id).execute()
    sb.table("pdf_chunks").delete().eq("pdf_id", pdf_id).execute()
    sb.table("pdfs").delete().eq("id", pdf_id).execute()

    return {"message": "PDF deleted successfully"}


@router.post("/pdfs/{pdf_id}/index")
async def index_pdf(
    pdf_id: int,
    current_user: dict = Depends(get_current_user),
):
    """
    Index a PDF: download from Supabase Storage, extract text/images, create chunks and embeddings.
    Only teachers and admins can perform this action.
    """
    if current_user.get("role") not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Only teachers and admins can index PDFs")

    sb = get_supabase()
    resp = sb.table("pdfs").select("*").eq("id", pdf_id).limit(1).execute()
    pdf = resp.data[0] if resp.data else None
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    tmp_path = None
    try:
        gemini_client = _get_gemini_client()

        # Download PDF from Supabase Storage to a temp file
        tmp_path = _download_pdf_from_storage(sb, pdf["storage_path"])

        # Delete existing chunks/embeddings for this PDF
        sb.table("rag_embeddings").delete().eq("pdf_id", pdf_id).execute()
        sb.table("pdf_chunks").delete().eq("pdf_id", pdf_id).execute()

        pages, total_pages = _extract_text_and_images_from_pdf(tmp_path)
        chunks_created = 0

        for page_info in pages:
            page_number = page_info["page_number"]
            page_text = page_info["text"]
            page_images = page_info["images"]

            image_captions = []
            image_embedding_payloads = []
            multimodal_page = False

            if page_images:
                multimodal_page = True
                for image_bytes in page_images[:4]:
                    caption = _caption_image_with_gemini(gemini_client, image_bytes)
                    if caption:
                        image_captions.append(caption)
                    multimodal_vector = _try_multimodal_embed(gemini_client, image_bytes, page_text)
                    if multimodal_vector is not None:
                        image_embedding_payloads.append({
                            "vector": multimodal_vector,
                            "caption": caption or "Visual content from PDF image",
                        })

            page_composite_text = page_text
            if image_captions:
                page_composite_text = (
                    f"{page_text}\n\nImage insights:\n" + "\n".join(f"- {c}" for c in image_captions)
                ).strip()

            if not page_composite_text.strip():
                continue

            text_chunks = _chunk_text(page_composite_text)
            for chunk_text in text_chunks:
                chunk_resp = sb.table("pdf_chunks").insert({
                    "pdf_id": pdf_id,
                    "content": chunk_text,
                    "source_file": pdf["filename"],
                    "page_number": page_number,
                    "chunk_index": chunks_created,
                }).execute()
                new_chunk = chunk_resp.data[0]

                embedding_vector = _embed_text(gemini_client, chunk_text)
                if embedding_vector:
                    sb.table("rag_embeddings").insert({
                        "pdf_id": pdf_id,
                        "pdf_chunk_id": new_chunk["id"],
                        "modality": "multimodal" if multimodal_page else "text",
                        "embedding_json": json.dumps(embedding_vector),
                        "page_number": page_number,
                    }).execute()

                chunks_created += 1

            # Image-specific multimodal vectors
            for img_payload in image_embedding_payloads:
                img_chunk_resp = sb.table("pdf_chunks").insert({
                    "pdf_id": pdf_id,
                    "content": f"Image insight: {img_payload['caption']}",
                    "source_file": pdf["filename"],
                    "page_number": page_number,
                    "chunk_index": chunks_created,
                }).execute()
                img_chunk = img_chunk_resp.data[0]

                sb.table("rag_embeddings").insert({
                    "pdf_id": pdf_id,
                    "pdf_chunk_id": img_chunk["id"],
                    "modality": "multimodal",
                    "embedding_json": json.dumps(img_payload["vector"]),
                    "page_number": page_number,
                }).execute()
                chunks_created += 1

        # Update PDF record
        sb.table("pdfs").update({
            "status": "indexed",
            "total_pages": total_pages,
            "total_chunks": chunks_created,
        }).eq("id", pdf_id).execute()

        return {
            "message": f"PDF indexed successfully: {chunks_created} chunks created from {total_pages} pages",
            "total_pages": total_pages,
            "total_chunks": chunks_created,
        }

    except Exception as e:
        sb.table("pdfs").update({"status": "failed"}).eq("id", pdf_id).execute()
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}")
    finally:
        # Always clean up temp file
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.get("/pdfs/{pdf_id}")
async def get_pdf_detail(
    pdf_id: int,
    current_user: dict = Depends(get_current_user),
):
    """
    Get details of a specific PDF, including uploader information.
    """
    sb = get_supabase()
    resp = sb.table("pdfs").select("*").eq("id", pdf_id).limit(1).execute()
    pdf = resp.data[0] if resp.data else None
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    uploader_name = "Unknown"
    if pdf.get("uploaded_by"):
        try:
            u_resp = sb.table("users").select("name").eq("id", pdf["uploaded_by"]).limit(1).execute()
            if u_resp.data:
                uploader_name = u_resp.data[0]["name"]
        except Exception:
            pass

    return {
        "id": pdf["id"],
        "filename": pdf["filename"],
        "status": pdf["status"],
        "total_pages": pdf.get("total_pages"),
        "total_chunks": pdf.get("total_chunks", 0),
        "uploaded_by": pdf.get("uploaded_by"),
        "uploader_name": uploader_name,
        "created_at": pdf.get("created_at"),
    }