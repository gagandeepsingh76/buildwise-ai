create extension if not exists "pgcrypto";
create extension if not exists "vector";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  supabase_user_id uuid unique,
  email text,
  full_name text,
  role text not null default 'guest' check (role in ('guest', 'admin')),
  language text not null default 'en' check (language in ('en', 'hi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.authorities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  short_name text not null,
  city text not null,
  state text not null,
  country text not null default 'India',
  aliases text[] not null default '{}',
  jurisdiction_notes text,
  official_website text,
  permit_portal text,
  forms_url text,
  bylaws_url text,
  contact jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid references public.authorities(id) on delete set null,
  title text not null,
  document_type text not null,
  city text not null,
  state text not null,
  country text not null default 'India',
  issuing_department text,
  effective_date date,
  official_url text,
  storage_path text,
  file_name text,
  mime_type text,
  file_size bigint,
  checksum text,
  status text not null default 'uploaded' check (status in ('external_reference', 'uploaded', 'processing', 'indexed', 'failed', 'deleted')),
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  indexed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  authority_id uuid references public.authorities(id) on delete set null,
  chunk_index integer not null,
  content text not null,
  token_count integer not null default 0,
  page_start integer,
  page_end integer,
  embedding vector(384),
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(content, ''))) stored,
  created_at timestamptz not null default now(),
  unique(document_id, chunk_index)
);

create table if not exists public.query_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  title text,
  language text not null default 'en' check (language in ('en', 'hi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.queries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.query_sessions(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  query text not null,
  language text not null default 'en' check (language in ('en', 'hi')),
  detected jsonb not null default '{}'::jsonb,
  answer jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  confidence numeric(5,4),
  created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  session_id uuid references public.query_sessions(id) on delete cascade,
  query_id uuid references public.queries(id) on delete cascade,
  title text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  query_id uuid references public.queries(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  rating integer check (rating between 1 and 5),
  label text check (label in ('helpful', 'unclear', 'incorrect', 'missing_source', 'unsafe')),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_authorities_city_state on public.authorities (lower(city), lower(state));
create index if not exists idx_authorities_aliases on public.authorities using gin (aliases);
create index if not exists idx_documents_authority on public.documents (authority_id, status);
create index if not exists idx_documents_city_state on public.documents (lower(city), lower(state));
create index if not exists idx_documents_tags on public.documents using gin (tags);
create index if not exists idx_document_chunks_document on public.document_chunks (document_id, chunk_index);
create index if not exists idx_document_chunks_authority on public.document_chunks (authority_id);
create index if not exists idx_document_chunks_search on public.document_chunks using gin (search_vector);
create index if not exists idx_queries_session_created on public.queries (session_id, created_at desc);
create index if not exists idx_favorites_user on public.favorites (user_id, created_at desc);

create index if not exists idx_document_chunks_embedding
  on public.document_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_document_chunks(
  query_embedding vector(384),
  match_count int default 8,
  filter_authority_id uuid default null,
  filter_city text default null,
  filter_state text default null,
  filter_document_type text default null,
  min_similarity float default 0.0
)
returns table (
  chunk_id uuid,
  document_id uuid,
  authority_id uuid,
  content text,
  page_start integer,
  page_end integer,
  chunk_index integer,
  document_title text,
  document_type text,
  authority_name text,
  city text,
  state text,
  official_url text,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    dc.id as chunk_id,
    dc.document_id,
    dc.authority_id,
    dc.content,
    dc.page_start,
    dc.page_end,
    dc.chunk_index,
    d.title as document_title,
    d.document_type,
    a.name as authority_name,
    d.city,
    d.state,
    d.official_url,
    dc.metadata || d.metadata as metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  left join public.authorities a on a.id = dc.authority_id
  where dc.embedding is not null
    and d.status = 'indexed'
    and (filter_authority_id is null or dc.authority_id = filter_authority_id)
    and (filter_city is null or lower(d.city) = lower(filter_city))
    and (filter_state is null or lower(d.state) = lower(filter_state))
    and (filter_document_type is null or lower(d.document_type) = lower(filter_document_type))
    and (1 - (dc.embedding <=> query_embedding)) >= min_similarity
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

alter table public.authorities enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.query_sessions enable row level security;
alter table public.queries enable row level security;
alter table public.favorites enable row level security;
alter table public.feedback enable row level security;

drop policy if exists "Public can read active authorities" on public.authorities;
create policy "Public can read active authorities"
  on public.authorities for select
  using (is_active = true);

drop policy if exists "Public can read indexed documents" on public.documents;
create policy "Public can read indexed documents"
  on public.documents for select
  using (status in ('external_reference', 'indexed'));

drop policy if exists "Public can read indexed chunks" on public.document_chunks;
create policy "Public can read indexed chunks"
  on public.document_chunks for select
  using (exists (
    select 1 from public.documents d
    where d.id = document_chunks.document_id and d.status = 'indexed'
  ));

drop trigger if exists set_users_updated_at on public.users;
drop trigger if exists set_authorities_updated_at on public.authorities;
drop trigger if exists set_documents_updated_at on public.documents;
drop trigger if exists set_query_sessions_updated_at on public.query_sessions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_users_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger set_authorities_updated_at before update on public.authorities
  for each row execute function public.set_updated_at();
create trigger set_documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();
create trigger set_query_sessions_updated_at before update on public.query_sessions
  for each row execute function public.set_updated_at();
