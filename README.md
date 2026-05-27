# BuildWise AI

BuildWise AI is a production-grade, authority-aware AI SaaS platform for building permissions, zoning, permits, construction compliance, FAR/FSI, setbacks, occupancy, inspections, and required documents.

It is built as a deployable monorepo:

- `frontend`: Next.js 16 App Router, TypeScript, Tailwind CSS 4, shadcn-style UI primitives, Framer Motion, Lucide, next-themes, multilingual English/Hindi UX.
- `backend`: FastAPI async API with jurisdiction detection, PDF ingestion, chunking, local embeddings, metadata-filtered retrieval, provider-pluggable grounded generation, admin document management, and report-ready answer schemas.
- `supabase`: PostgreSQL + pgvector migrations, retrieval RPC, RLS read policies, storage bucket setup, and seed authority data.
- `shared`: reusable authority catalog and API contracts.

## Core Behavior

The assistant is jurisdiction-specific by design.

Example: “Can I build a roof garden in Kanpur?”

1. Detects Kanpur.
2. Maps it to KDA.
3. Filters retrieval to KDA/Kanpur sources.
4. Prioritizes uploaded official PDFs.
5. Answers only from retrieved context.
6. Separates facts from assumptions.
7. Shows source references and official authority links.
8. Returns confidence and uncertainty notes.

If jurisdiction is missing, the API asks a follow-up question instead of giving generic compliance advice.

## Features

- Authority-aware RAG with city/state/authority/document-type filtering.
- Real PDF ingestion with text extraction, chunking, overlap, embeddings, pgvector indexing, and metadata.
- Free/local CPU-friendly embeddings via `sentence-transformers/all-MiniLM-L6-v2`.
- LLM provider architecture: `local`, Gemini, Groq, OpenRouter, and OpenAI.
- Grounded answer format with summary, allowed status, approvals, documents, restrictions, FAR/height/setback notes, inspections, risks, next steps, links, citations, confidence, and uncertainty.
- Admin dashboard for PDF upload and metadata tagging.
- English and Hindi UI with persisted language selection.
- Light/dark mode with persisted theme.
- Recent searches, local bookmarks, jurisdiction comparison, document search, source cards, feedback, answer sharing, and downloadable PDF reports.
- Deployment-ready for Vercel, Render, and Supabase free tiers.

## Local Setup

Requirements:

- Node.js 22+
- npm 10+
- Python 3.11+
- Supabase project for production pgvector storage

Install frontend:

```bash
npm --prefix frontend install
```

Install backend:

```bash
python -m pip install -r backend/requirements.txt
```

Create environment files:

```bash
copy .env.example .env
copy frontend\.env.example frontend\.env.local
copy backend\.env.example backend\.env
```

Run backend:

```bash
python -m uvicorn app.main:app --app-dir backend --reload --host 0.0.0.0 --port 8000
```

Run frontend:

```bash
npm --prefix frontend run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000`.

## Supabase Setup

Run these SQL files in order:

```text
supabase/migrations/0001_init.sql
supabase/migrations/0002_seed_authorities.sql
supabase/migrations/0003_storage.sql
```

Then set backend env vars:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=authority-documents
```

The service-role key must stay on the backend only.

## Environment Variables

Important backend variables:

```env
FRONTEND_ORIGINS=http://localhost:3000
ADMIN_API_KEY=change-this-before-production
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
EMBEDDING_PROVIDER=sentence-transformers
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
LLM_PROVIDER=local
RAG_TOP_K=8
RAG_MIN_SIMILARITY=0.18
```

Provider variables:

```env
LLM_PROVIDER=gemini | groq | openrouter | openai | local
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
OPENAI_API_KEY=
LLM_MODEL=
```

Frontend variables:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## API

- `GET /health`
- `GET /authorities`
- `POST /ask`
- `POST /search`
- `GET /documents`
- `GET /documents/{id}`
- `POST /documents`
- `POST /ingest`
- `DELETE /documents/{id}`
- `GET /history`
- `GET /favorites`
- `POST /favorites`
- `DELETE /favorites/{id}`
- `POST /feedback`

Admin upload endpoints require:

```http
X-Admin-Api-Key: <ADMIN_API_KEY>
```

## PDF Ingestion

Upload through the admin console or use the script:

```bash
python backend/scripts/ingest_directory.py ./pdfs ^
  --authority-id kda-kanpur ^
  --city Kanpur ^
  --state "Uttar Pradesh" ^
  --document-type bylaws ^
  --official-url https://www.kdaindia.co.in/
```

The pipeline extracts searchable PDF text, chunks with overlap, embeds chunks, stores metadata, writes files to Supabase Storage when configured, and indexes vectors in `document_chunks`.

## Deployment

Supabase:

1. Create a free Supabase project.
2. Run migrations.
3. Copy project URL, service-role key, and anon key.

Render backend:

1. Use `render.yaml` or create a Docker web service with root `backend`.
2. Health check: `/health`.
3. Add backend env vars.
4. Set `FRONTEND_ORIGINS` to the Vercel domain.

Vercel frontend:

1. Import the repo.
2. Set root directory to `frontend`.
3. Add `NEXT_PUBLIC_API_BASE_URL` pointing to Render.
4. Deploy.

## Verification

Commands used for verification:

```bash
npm --prefix frontend run lint
npm --prefix frontend run build
python -m pytest backend/tests
python -m compileall backend/app backend/scripts
```

Live smoke checks verified:

- Backend `/health`.
- Frontend dev server returns HTTP 200.
- Hindi Lucknow query detects LDA.
- PDF upload indexes a live KDA document.
- Follow-up `/ask` retrieves the uploaded KDA source and returns a source-backed answer.

## Sample Usage Flow

1. Open the app.
2. Select Hindi or English.
3. Select an authority or let the system detect it from the question.
4. Ask: “Can I build a roof garden in Kanpur?”
5. Review allowed status, confidence, assumptions, official links, and source cards.
6. Upload authority PDFs from the admin console for stronger answers.
7. Download the compliance report PDF.

## Known Limitations

- The system cannot confirm exact legal requirements unless official documents are uploaded and indexed for that jurisdiction.
- Scanned PDFs need OCR before upload.
- Render free services can sleep, causing slower first responses.
- The default `local` LLM mode is conservative and extractive. For more natural prose, configure Gemini, Groq, OpenRouter, or OpenAI while keeping retrieval-grounding rules enabled.
