# Deployment

## Supabase

Run all SQL files in `supabase/migrations`. The schema enables `pgvector`, creates authority/document/query tables, seeds initial Indian authority metadata, and creates the private `authority-documents` bucket.

## Render Backend

1. Create a new Render web service from this repository.
2. Use `backend` as the root directory or import `render.yaml`.
3. Runtime: Docker.
4. Health check path: `/health`.
5. Add environment variables from `.env.example`.
6. Set `FRONTEND_ORIGINS` to your Vercel URL, for example `https://buildwise-ai.vercel.app`.

## Vercel Frontend

1. Import the repository in Vercel.
2. Set project root to `frontend`.
3. Add:
   - `NEXT_PUBLIC_API_BASE_URL=https://<render-service>.onrender.com`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy.

## Free-Tier Notes

Render free services can sleep. The frontend handles delayed API responses with loading UI; first response after sleep can take longer.
