export const SUPABASE_PROJECT_ID = "cxretrzlhzsijiegyiwl";
export const SUPABASE_URL = "https://cxretrzlhzsijiegyiwl.supabase.co";
export const CONTRACT_PDF_BUCKET = "contract-pdfs";
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export const UNIT_OPTIONS = [
  "UIT JBM",
  "UPT Probolinggo",
  "UPT Surabaya",
  "UPT Gresik",
  "UPT Malang",
  "UPT Madiun",
] as const;

export type UnitName = (typeof UNIT_OPTIONS)[number];

export const DOCUMENT_STATUSES = [
  "uploaded",
  "processing",
  "needs_review",
  "approved",
  "failed",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

