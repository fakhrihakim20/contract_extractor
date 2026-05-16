import { MAX_PDF_BYTES } from "@/lib/constants";

export type DocumentListItem = {
  id: string;
  original_filename: string;
  status: string;
  file_size_bytes: number;
  error_message: string | null;
  created_at: string;
  extraction_jobs: { status: string; model: string | null }[] | null;
  contract_extraction_drafts:
    | {
        contract_number: string | null;
        vendor_name: string | null;
        unit_name: string | null;
        unit_raw: string | null;
      }[]
    | null;
};

export type DraftDetail = {
  document: {
    id: string;
    original_filename: string;
    status: string;
    error_message: string | null;
    created_at: string;
    updated_at: string;
  };
  job: {
    id: string;
    status: string;
    model: string | null;
    raw_output: unknown;
    confidence_summary: unknown;
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
  } | null;
  draft: {
    id: string;
    contract_number: string | null;
    contract_year: number | null;
    contract_date: string | null;
    vendor_name: string | null;
    unit_name: string | null;
    unit_raw: string | null;
    fields_confidence: Record<string, number | null>;
    review_notes: string | null;
  } | null;
  items: Array<{
    id: string;
    item_id: string;
    description: string;
    unit: string;
    material_unit_price: number | null;
    service_unit_price: number | null;
    source_page: number | null;
    source_text: string | null;
    confidence: number | null;
    warnings: string[];
  }>;
};

export type ContractListItem = {
  id: string;
  contract_number: string;
  contract_year: number | null;
  contract_date: string | null;
  vendor_name: string;
  unit_name: string;
  approved_at: string;
  boq_items: Array<{
    id: string;
    item_id: string;
    description: string;
    unit: string;
    material_unit_price: number | null;
    service_unit_price: number | null;
  }>;
};

export function validatePdf(file: File) {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return "File harus berupa PDF.";
  }

  if (file.size > MAX_PDF_BYTES) {
    return "Ukuran PDF maksimal 50MB.";
  }

  return null;
}

export async function apiFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }

  return payload as T;
}

