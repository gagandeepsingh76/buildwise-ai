alter table public.documents
  add column if not exists chunk_count integer not null default 0;

update public.documents d
set chunk_count = counts.total
from (
  select document_id, count(*)::integer as total
  from public.document_chunks
  group by document_id
) counts
where d.id = counts.document_id;

create or replace function public.refresh_document_chunk_count()
returns trigger
language plpgsql
as $$
declare
  affected_document_id uuid;
begin
  affected_document_id = coalesce(new.document_id, old.document_id);

  update public.documents
  set chunk_count = (
    select count(*)::integer
    from public.document_chunks
    where document_id = affected_document_id
  )
  where id = affected_document_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists refresh_document_chunk_count_insert on public.document_chunks;
drop trigger if exists refresh_document_chunk_count_delete on public.document_chunks;
drop trigger if exists refresh_document_chunk_count_update on public.document_chunks;

create trigger refresh_document_chunk_count_insert
  after insert on public.document_chunks
  for each row execute function public.refresh_document_chunk_count();

create trigger refresh_document_chunk_count_delete
  after delete on public.document_chunks
  for each row execute function public.refresh_document_chunk_count();

create trigger refresh_document_chunk_count_update
  after update of document_id on public.document_chunks
  for each row execute function public.refresh_document_chunk_count();
