# 📘 ABOUT EDU RAG

## Project Title  
**EduRAG – Enterprise Academic Intelligence Platform**

---

## 🎯 What is EduRAG?

EduRAG is a secure, AI-powered academic knowledge platform designed for educational institutions.  
It enables students to search institutional PDF documents and receive accurate, citation-backed answers generated using Retrieval-Augmented Generation (RAG).

The system ensures that AI responses are grounded in uploaded academic materials rather than external or hallucinated sources.

---

## 🧠 Core Idea

Traditional AI chatbots generate answers from general knowledge, which can lead to incorrect or unverified responses.

EduRAG solves this by:

1. Retrieving relevant content from institution-approved documents.
2. Generating answers strictly based on retrieved content.
3. Displaying a Faithfulness Score (0–1) to indicate reliability.
4. Providing page-level citations for transparency.

This makes the system academically trustworthy and institution-ready.

---

## 👥 User Roles

### 👨‍🎓 Students
- Login using Institutional ID
- Search PDFs using natural language
- View AI-generated answers with citations
- See faithfulness confidence score
- Provide feedback ("I'm Confused" or 1–5 rating)

### 👩‍🏫 Teachers
- Upload academic PDFs
- Monitor student confusion trends
- View answer quality analytics
- Identify difficult topics
- Escalate concerns to Admin

### 👨‍💼 Admin
- Manage user roles (student/teacher/admin)
- Monitor overall system performance
- Review teacher escalations
- Maintain institutional quality control

---

## 🔬 Technical Architecture

EduRAG uses a modern AI architecture:

- **Frontend:** Next.js 15
- **Backend:** FastAPI
- **Database:** Supabase PostgreSQL with pgvector
- **AI Models:** Gemini (Text + Multimodal Embeddings)

### Workflow:

1. Teacher uploads a PDF.
2. System extracts text and images.
3. Content is converted into 768-dimensional vector embeddings.
4. When a student asks a question:
   - The system finds the most relevant document chunks.
   - Gemini generates an answer based only on that content.
   - A faithfulness verification step evaluates answer grounding.
5. Student feedback improves future retrieval quality.

---

## 🔁 Continuous Improvement Loop

EduRAG includes a feedback intelligence system:

- Student ratings influence retrieval ranking.
- Confusion logs highlight difficult topics.
- Teachers analyze trends.
- Admin oversees quality control.
- Future answers improve based on real usage data.

This creates a self-improving academic AI ecosystem.

---

## 🔐 Security & Institutional Focus

- Institutional ID-based login
- Role-based access control (RLS)
- Secure document storage
- No public internet data usage in answers
- Admin-controlled password resets
- Environment-based API key protection

EduRAG is built specifically for academic environments where accuracy, traceability, and security are critical.

---

## 🚀 Project Objective

The goal of EduRAG is to build an enterprise-grade academic AI system that:

- Reduces student confusion
- Increases transparency in AI responses
- Helps teachers identify weak learning areas
- Provides administrators actionable insights
- Demonstrates practical implementation of Multimodal RAG

---

## 📌 Conclusion

EduRAG is not just a chatbot.

It is a structured Academic Intelligence Platform that combines:
- Secure access control
- Multimodal document understanding
- Retrieval-Augmented Generation
- Answer verification
- Feedback-driven improvement

It is designed to be scalable, transparent, and institution-ready.
