# Security Notes

- Admin document ingestion requires `X-Admin-Api-Key`.
- Supabase service-role keys belong only on the backend.
- The frontend uses only public API URLs and optional Supabase anon keys.
- RLS policies allow public reads for active authorities and indexed documents; writes are intended to run through the backend service role.
- The assistant prompt forbids fabricated numeric regulations and instructs every provider to answer only from retrieved context.
