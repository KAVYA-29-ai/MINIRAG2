
"""
MINI-RAG Backend Main Entry Point

This file launches the FastAPI application for the MINI-RAG project.
It provides API endpoints for:
    - Authentication
    - User management
    - Feedback
    - RAG (Retrieval-Augmented Generation) search
    - Analytics
    - Chat

All persistent data is stored in Supabase PostgreSQL.
Routers are imported from the backend/routers/ directory.
"""
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
import time
from collections import defaultdict, deque
import os
from jose import JWTError, jwt

# --- In-memory rate limiting middleware (per-IP, 60 req/min) ---
RATE_LIMIT = 60  # requests
RATE_PERIOD = 60  # seconds
_ip_buckets = defaultdict(lambda: deque())

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory request limiter keyed by client IP."""

    async def dispatch(self, request, call_next):
        ip = request.client.host if request.client else "unknown"
        now = time.time()
        bucket = _ip_buckets[ip]
        # Remove old timestamps
        while bucket and now - bucket[0] > RATE_PERIOD:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again later."},
            )
        bucket.append(now)
        return await call_next(request)

# --- Security headers middleware ---
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach baseline HTTP security headers to every response."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        return response

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.extension import _rate_limit_exceeded_handler
from dotenv import load_dotenv
from pathlib import Path
from core.rate_limit import limiter
from services.realtime import WebSocketConnectionManager

# Load environment variables
load_dotenv()

# Import routers (absolute imports for Vercel)
from routers import auth, users, feedback, student_feedback, rag, analytics, chat

# Create FastAPI app

app = FastAPI(
    title="EduRag API",
    description="Backend API for EduRag - Educational RAG Platform",
    version="1.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Global error handler for HTTPException and generic Exception
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail or "HTTP error occurred"},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*.vercel.app", "localhost", "127.0.0.1", "testserver"],
)

frontend_url = os.getenv("FRONTEND_URL")

# CORS configuration - allow only configured frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url] if frontend_url else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["Feedback"])
app.include_router(student_feedback.router, prefix="/api/student-feedback", tags=["Student Feedback"])
app.include_router(rag.router, prefix="/api/rag", tags=["RAG Search"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chatroom"])


ws_manager = WebSocketConnectionManager()
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_BUILD_DIR = ROOT_DIR / "build"
FRONTEND_STATIC_DIR = FRONTEND_BUILD_DIR / "static"

@app.get("/api/health")
async def health_check():
    """Health endpoint used by deployment checks and monitors."""
    return {"status": "healthy"}


@app.websocket("/api/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """Authenticated broadcast websocket endpoint for real-time collaboration updates."""
    token = websocket.query_params.get("token")
    if not token or not JWT_SECRET:
        await websocket.close(code=1008)
        return

    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        await websocket.close(code=1008)
        return

    await ws_manager.connect(websocket)
    try:
        while True:
            message = await websocket.receive_text()
            await ws_manager.broadcast(message)
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

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
    uvicorn.run(app, host="127.0.0.1", port=8000)
