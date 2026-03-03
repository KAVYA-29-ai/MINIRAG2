"""
Vercel Serverless Function — entry point for FastAPI backend.
Vercel auto-detects the `app` variable (ASGI) and wraps it.
"""
import sys
import os

# Add backend/ to Python path so all imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

# Import the FastAPI app — Vercel picks this up automatically
from main import app
