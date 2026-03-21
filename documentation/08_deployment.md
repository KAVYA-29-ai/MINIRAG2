# 08 — Deployment

This file explains how to deploy the frontend to Vercel and options for the backend.

Frontend (Vercel)

1. Create a Vercel project from the GitHub repo.
2. Set the project build settings:

```text
Build command: npm run build
Output directory: build
```

3. Add the following environment variables in Vercel (both Preview and Production):
- `REACT_APP_API_BASE_URL` — e.g. `https://<your-domain>.vercel.app/api`

Backend

- Option A: Deploy backend as Vercel Serverless Functions
  - Move `backend` routes into `api/` or configure serverless handlers.

- Option B: Deploy backend separately (recommended for heavy LLM usage)
  - Deploy to Railway, Fly, Heroku or a VM and set `REACT_APP_API_BASE_URL` to the backend URL.

Example `vercel.json` (simple rewrite to serve `/api` from serverless functions):

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" }
  ]
}
```

Secrets & environment variables
- `SUPABASE_URL`, `SUPABASE_KEY`, `DATABASE_URL`, `OPENAI_API_KEY`, `SECRET_KEY`
- Never commit `.env` to source control.

Monitoring & Rollback
- Use Vercel deployment logs for build and runtime errors.
- Roll back via the Vercel dashboard if a deployment fails.
