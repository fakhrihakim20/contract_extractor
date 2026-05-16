# PRD: Contract BoQ Extractor

## Ringkasan

Sistem dashboard web internal untuk upload PDF scan kontrak, mengekstrak metadata dan BoQ secara otomatis, menyimpan hasil ke staging, lalu memasukkan data final ke Supabase setelah review.

## Data Yang Diekstrak

- ID item BoQ
- Uraian Pekerjaan
- Satuan
- Harga Satuan Material
- Harga Satuan Jasa
- Nomor Kontrak
- Tahun Kontrak
- Tanggal Kontrak
- Nama Vendor
- Nama Unit: `UIT JBM`, `UPT Probolinggo`, `UPT Surabaya`, `UPT Gresik`, `UPT Malang`, `UPT Madiun`

## Acceptance Criteria

- PDF non-PDF atau lebih dari 50MB ditolak.
- PDF valid masuk ke queue ekstraksi.
- Hasil ekstraksi masuk draft dan tidak otomatis masuk final.
- Reviewer dapat mengedit metadata dan baris BoQ.
- Approval membuat row final di `contracts` dan `boq_items`.
- Nomor kontrak final unik.
- Unit di luar enum ditahan sebagai `unit_raw` dan perlu dipilih manual sebelum approval.

## Risiko Dan Mitigasi

- OCR/AI tidak selalu sempurna: gunakan review wajib dan confidence/warnings.
- File kontrak sensitif: bucket private, RLS aktif, service role hanya server-side.
- Ekstraksi lama: Edge Function memakai background task saat runtime mendukung `waitUntil`.

