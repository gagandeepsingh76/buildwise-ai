# BuildWise AI Architecture

BuildWise AI is split into:

- `frontend`: Next.js App Router, TypeScript, Tailwind CSS, shadcn-style components, Framer Motion, Lucide, multilingual UI.
- `backend`: FastAPI service with authority detection, PDF ingestion, chunking, local embeddings, pgvector retrieval, grounded generation, and admin document APIs.
- `supabase`: PostgreSQL/pgvector schema, retrieval RPC, RLS read policies, authority seed data.
- `shared`: framework-neutral authority catalog and TypeScript API contracts.

The backend always filters retrieval by detected jurisdiction when a city or authority is known. If no jurisdiction is detected, `/ask` returns a follow-up question instead of generic advice.

Uploaded authority documents are chunked with overlap, embedded using `sentence-transformers/all-MiniLM-L6-v2`, stored in Supabase, and retrieved through the `match_document_chunks` RPC. If Supabase is not configured, local in-memory uploads work for development sessions.
