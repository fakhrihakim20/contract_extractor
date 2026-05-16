# Contract BoQ Extractor

Dashboard internal untuk upload PDF scan kontrak, ekstraksi otomatis data BoQ, review draft, lalu approval ke tabel final Supabase.

## Status Implementasi

- Supabase project: `Contract BoQ Extractor`
- Project ref: `cxretrzlhzsijiegyiwl`
- Region: `ap-southeast-1`
- Edge Function: `process-contract`
- Bucket private: `contract-pdfs`

Schema database dan Edge Function sudah disiapkan di folder `supabase/`.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Supabase Auth, Postgres, Storage, Edge Functions
- OpenAI Responses API dengan PDF input dan Structured Outputs
- Zod untuk validasi payload aplikasi
- Vitest untuk unit test helper ekstraksi

## Setup Lokal

1. Install dependencies:

   ```bash
   npm install
   ```

2. Buat `.env.local` dari `.env.example`, lalu isi key berikut:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://cxretrzlhzsijiegyiwl.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   SUPABASE_URL=https://cxretrzlhzsijiegyiwl.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   OPENAI_API_KEY=...
   OPENAI_MODEL=gpt-5.2
   ```

3. Set secret Edge Function di Supabase:

   ```bash
   npx supabase secrets set OPENAI_API_KEY=... OPENAI_MODEL=gpt-5.2 --project-ref cxretrzlhzsijiegyiwl
   ```

4. Jalankan app:

   ```bash
   npm run dev
   ```

## Alur Aplikasi

1. User login via Supabase magic link.
2. User upload PDF ke private bucket `contract-pdfs`.
3. Next.js API membuat row `documents` dan `extraction_jobs`.
4. API memicu Edge Function `process-contract`.
5. Edge Function mengirim PDF ke OpenAI Responses API dan menyimpan hasil ke draft tables.
6. User review/edit metadata kontrak dan item BoQ.
7. Approval memanggil RPC `approve_contract_document` untuk menyalin draft ke `contracts` dan `boq_items`.

## Tabel Utama

- `documents`
- `extraction_jobs`
- `contract_extraction_drafts`
- `boq_extraction_draft_items`
- `contracts`
- `boq_items`

RLS aktif untuk seluruh tabel public. Authenticated users dapat membaca data dashboard; mutasi tabel dilakukan server-side memakai service role. Upload file PDF dilakukan langsung dari browser ke Storage dengan policy authenticated pada bucket `contract-pdfs`.

## Commands

```bash
npm run dev
npm run lint
npm run test
npm run build
```

## Deployment Notes

- Tambahkan semua env vars di Vercel.
- Tambahkan redirect URL Vercel di Supabase Auth URL configuration.
- Pastikan `OPENAI_API_KEY` tersedia di Supabase Edge Function secrets sebelum upload PDF pertama.
- Batas PDF v1: 50MB.

