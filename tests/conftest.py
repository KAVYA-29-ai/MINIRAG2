import os, sys, pathlib

# Add tests/ dir to path so _mock_setup.py is importable
sys.path.insert(0, str(pathlib.Path(__file__).parent))
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "backend"))

os.environ["JWT_SECRET"] = "your-secret-key"
os.environ["JWT_ALGORITHM"] = "HS256"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "60"
os.environ["AUTH_RATE_LIMIT"] = "1000/minute"
os.environ["SUPABASE_URL"] = "https://mock.supabase.co"
os.environ["SUPABASE_KEY"] = "mock-anon-key"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "mock-service-key"
os.environ["GEMINI_API_KEY"] = "mock-gemini-key"
