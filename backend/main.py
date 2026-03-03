"""
EduRag Backend - FastAPI with Supabase
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
import os
from pathlib import Path

# Load environment variables
load_dotenv()

# Import routers
from routers import auth, users, feedback, rag, analytics

# Create FastAPI app
app = FastAPI(
    title="EduRag API",
    description="Backend API for EduRag - Educational RAG Platform",
    version="1.0.0"
)

# CORS configuration - Allow Vercel frontend + dev origins + Codespaces
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"https://.*(\.vercel\.app|\.app\.github\.dev|\.preview\.app\.github\.dev)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["Feedback"])
app.include_router(rag.router, prefix="/api/rag", tags=["RAG Search"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_BUILD_DIR = ROOT_DIR / "build"
FRONTEND_STATIC_DIR = FRONTEND_BUILD_DIR / "static"

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}

if FRONTEND_BUILD_DIR.exists():
    if FRONTEND_STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(FRONTEND_STATIC_DIR)), name="frontend-static")

    @app.get("/")
    async def root():
        index_file = FRONTEND_BUILD_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return {"message": "EduRag API is running", "version": "1.0.0"}

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")

        candidate_file = FRONTEND_BUILD_DIR / full_path
        if candidate_file.is_file():
            return FileResponse(candidate_file)

        index_file = FRONTEND_BUILD_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return {"message": "EduRag API is running", "version": "1.0.0"}
else:
    @app.get("/")
    async def root():
        return {"message": "EduRag API is running", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
