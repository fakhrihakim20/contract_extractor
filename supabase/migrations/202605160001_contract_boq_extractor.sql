create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'document_status') then
    create type public.document_status as enum (
      'uploaded',
      'processing',
      'needs_review',
      'approved',
      'failed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'extraction_job_status') then
    create type public.extraction_job_status as enum (
      'queued',
      'processing',
      'succeeded',
      'failed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'contract_unit_name') then
    create type public.contract_unit_name as enum (
      'UIT JBM',
      'UPT Probolinggo',
      'UPT Surabaya',
      'UPT Gresik',
      'UPT Malang',
      'UPT Madiun'
    );
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references auth.users(id) on delete set null,
  original_filename text not null,
  storage_bucket text not null default 'contract-pdfs',
  storage_path text not null unique,
  mime_type text not null default 'application/pdf',
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 52428800),
  status public.document_status not null default 'uploaded',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  status public.extraction_job_status not null default 'queued',
  model text,
  raw_output jsonb,
  confidence_summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contract_extraction_drafts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  contract_number text,
  contract_year integer check (contract_year is null or contract_year between 1900 and 2200),
  contract_date date,
  vendor_name text,
  unit_name public.contract_unit_name,
  unit_raw text,
  fields_confidence jsonb not null default '{}'::jsonb,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.boq_extraction_draft_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  draft_id uuid not null references public.contract_extraction_drafts(id) on delete cascade,
  sort_order integer not null default 0,
  item_id text not null,
  description text not null,
  unit text not null,
  material_unit_price numeric(18, 2),
  service_unit_price numeric(18, 2),
  source_page integer check (source_page is null or source_page > 0),
  source_text text,
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  warnings text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete restrict,
  contract_number text not null unique,
  contract_year integer check (contract_year is null or contract_year between 1900 and 2200),
  contract_date date,
  vendor_name text not null,
  unit_name public.contract_unit_name not null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.boq_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  item_id text not null,
  description text not null,
  unit text not null,
  material_unit_price numeric(18, 2),
  service_unit_price numeric(18, 2),
  source_page integer,
  source_text text,
  confidence numeric(4, 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, item_id)
);

create index if not exists documents_status_idx on public.documents(status);
create index if not exists documents_uploaded_by_idx on public.documents(uploaded_by);
create index if not exists extraction_jobs_status_idx on public.extraction_jobs(status);
create index if not exists draft_items_document_sort_idx on public.boq_extraction_draft_items(document_id, sort_order);
create index if not exists draft_items_draft_id_idx on public.boq_extraction_draft_items(draft_id);
create index if not exists contracts_unit_year_idx on public.contracts(unit_name, contract_year);
create index if not exists contracts_approved_by_idx on public.contracts(approved_by);

drop trigger if exists set_documents_updated_at on public.documents;
create trigger set_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

drop trigger if exists set_extraction_jobs_updated_at on public.extraction_jobs;
create trigger set_extraction_jobs_updated_at
before update on public.extraction_jobs
for each row execute function public.set_updated_at();

drop trigger if exists set_contract_extraction_drafts_updated_at on public.contract_extraction_drafts;
create trigger set_contract_extraction_drafts_updated_at
before update on public.contract_extraction_drafts
for each row execute function public.set_updated_at();

drop trigger if exists set_boq_extraction_draft_items_updated_at on public.boq_extraction_draft_items;
create trigger set_boq_extraction_draft_items_updated_at
before update on public.boq_extraction_draft_items
for each row execute function public.set_updated_at();

drop trigger if exists set_contracts_updated_at on public.contracts;
create trigger set_contracts_updated_at
before update on public.contracts
for each row execute function public.set_updated_at();

drop trigger if exists set_boq_items_updated_at on public.boq_items;
create trigger set_boq_items_updated_at
before update on public.boq_items
for each row execute function public.set_updated_at();

alter table public.documents enable row level security;
alter table public.extraction_jobs enable row level security;
alter table public.contract_extraction_drafts enable row level security;
alter table public.boq_extraction_draft_items enable row level security;
alter table public.contracts enable row level security;
alter table public.boq_items enable row level security;

drop policy if exists "authenticated read documents" on public.documents;
create policy "authenticated read documents"
on public.documents for select to authenticated using (true);

drop policy if exists "authenticated read extraction jobs" on public.extraction_jobs;
create policy "authenticated read extraction jobs"
on public.extraction_jobs for select to authenticated using (true);

drop policy if exists "authenticated read contract drafts" on public.contract_extraction_drafts;
create policy "authenticated read contract drafts"
on public.contract_extraction_drafts for select to authenticated using (true);

drop policy if exists "authenticated read boq draft items" on public.boq_extraction_draft_items;
create policy "authenticated read boq draft items"
on public.boq_extraction_draft_items for select to authenticated using (true);

drop policy if exists "authenticated read contracts" on public.contracts;
create policy "authenticated read contracts"
on public.contracts for select to authenticated using (true);

drop policy if exists "authenticated read boq items" on public.boq_items;
create policy "authenticated read boq items"
on public.boq_items for select to authenticated using (true);

grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all routines in schema public to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contract-pdfs', 'contract-pdfs', false, 52428800, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated read contract pdfs" on storage.objects;
create policy "authenticated read contract pdfs"
on storage.objects for select to authenticated
using (bucket_id = 'contract-pdfs');

drop policy if exists "authenticated upload contract pdfs" on storage.objects;
create policy "authenticated upload contract pdfs"
on storage.objects for insert to authenticated
with check (bucket_id = 'contract-pdfs');

drop policy if exists "authenticated update contract pdfs" on storage.objects;
create policy "authenticated update contract pdfs"
on storage.objects for update to authenticated
using (bucket_id = 'contract-pdfs')
with check (bucket_id = 'contract-pdfs');

drop policy if exists "authenticated delete contract pdfs" on storage.objects;
create policy "authenticated delete contract pdfs"
on storage.objects for delete to authenticated
using (bucket_id = 'contract-pdfs');

create or replace function public.approve_contract_document(
  p_document_id uuid,
  p_approved_by uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_draft public.contract_extraction_drafts%rowtype;
  v_contract_id uuid;
begin
  select *
  into v_draft
  from public.contract_extraction_drafts
  where document_id = p_document_id;

  if not found then
    raise exception 'Draft ekstraksi tidak ditemukan untuk dokumen %', p_document_id;
  end if;

  if v_draft.contract_number is null or btrim(v_draft.contract_number) = '' then
    raise exception 'Nomor kontrak wajib diisi sebelum approval';
  end if;

  if v_draft.vendor_name is null or btrim(v_draft.vendor_name) = '' then
    raise exception 'Nama vendor wajib diisi sebelum approval';
  end if;

  if v_draft.unit_name is null then
    raise exception 'Nama unit harus dipilih dari daftar valid sebelum approval';
  end if;

  if not exists (
    select 1
    from public.boq_extraction_draft_items
    where document_id = p_document_id
  ) then
    raise exception 'Minimal satu item BoQ wajib tersedia sebelum approval';
  end if;

  insert into public.contracts (
    document_id,
    contract_number,
    contract_year,
    contract_date,
    vendor_name,
    unit_name,
    approved_by,
    approved_at
  )
  values (
    p_document_id,
    btrim(v_draft.contract_number),
    v_draft.contract_year,
    v_draft.contract_date,
    btrim(v_draft.vendor_name),
    v_draft.unit_name,
    p_approved_by,
    now()
  )
  on conflict (document_id) do update set
    contract_number = excluded.contract_number,
    contract_year = excluded.contract_year,
    contract_date = excluded.contract_date,
    vendor_name = excluded.vendor_name,
    unit_name = excluded.unit_name,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at
  returning id into v_contract_id;

  delete from public.boq_items
  where contract_id = v_contract_id;

  insert into public.boq_items (
    contract_id,
    item_id,
    description,
    unit,
    material_unit_price,
    service_unit_price,
    source_page,
    source_text,
    confidence
  )
  select
    v_contract_id,
    item_id,
    description,
    unit,
    material_unit_price,
    service_unit_price,
    source_page,
    source_text,
    confidence
  from public.boq_extraction_draft_items
  where document_id = p_document_id
  order by sort_order, created_at;

  update public.documents
  set status = 'approved',
      error_message = null
  where id = p_document_id;

  return v_contract_id;
end;
$$;

revoke all on function public.approve_contract_document(uuid, uuid) from anon, authenticated;
grant execute on function public.approve_contract_document(uuid, uuid) to service_role;
