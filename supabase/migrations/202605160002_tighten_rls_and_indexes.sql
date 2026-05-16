drop policy if exists "authenticated insert documents" on public.documents;
drop policy if exists "authenticated update documents" on public.documents;
drop policy if exists "authenticated write extraction jobs" on public.extraction_jobs;
drop policy if exists "authenticated write contract drafts" on public.contract_extraction_drafts;
drop policy if exists "authenticated write boq draft items" on public.boq_extraction_draft_items;
drop policy if exists "authenticated write contracts" on public.contracts;
drop policy if exists "authenticated write boq items" on public.boq_items;

create index if not exists documents_uploaded_by_idx on public.documents(uploaded_by);
create index if not exists draft_items_draft_id_idx on public.boq_extraction_draft_items(draft_id);
create index if not exists contracts_approved_by_idx on public.contracts(approved_by);

