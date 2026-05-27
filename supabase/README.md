# Supabase Setup

1. Create a Supabase project on the free tier.
2. In SQL Editor, run migrations in order:
   - `migrations/0001_init.sql`
   - `migrations/0002_seed_authorities.sql`
   - `migrations/0003_storage.sql`
3. Confirm the `authority-documents` private storage bucket exists.
4. Copy these project values into environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY` for optional frontend auth work
5. Keep the service-role key on the backend only.

The retrieval RPC is `match_document_chunks`. It performs authority/city/state/document-type filtering before cosine similarity ranking.
