# Operations

## Adding an Authority

1. Insert a row into `authorities` or add it to `shared/authority_catalog.json`.
2. Include aliases for city names, authority acronyms, and common spellings.
3. Upload official PDFs with matching `authority_id`, city, state, document type, official URL, tags, and issuing department.
4. Ask a jurisdiction-specific question and confirm source cards point to the uploaded document.

## Reindexing

Delete and re-upload the document through the admin console, or call `/documents/{id}` delete and `/ingest` upload again.

## Grounding Policy

The assistant must not invent rules. Seeded authority profiles provide official links and routing context only. Uploaded authority documents are the source of record for legal/regulatory answers.
