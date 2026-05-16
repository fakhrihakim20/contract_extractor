import { z } from "zod";
import { UNIT_OPTIONS, type UnitName } from "@/lib/constants";

export const confidenceSchema = z
  .number()
  .min(0)
  .max(1)
  .nullable()
  .optional();

export const contractMetadataSchema = z.object({
  contract_number: z.string().trim().min(1, "Nomor kontrak wajib diisi"),
  contract_year: z.coerce
    .number()
    .int()
    .min(1900)
    .max(2200)
    .nullable()
    .optional(),
  contract_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD")
    .nullable()
    .optional(),
  vendor_name: z.string().trim().min(1, "Nama vendor wajib diisi"),
  unit_name: z.enum(UNIT_OPTIONS).nullable().optional(),
  unit_raw: z.string().trim().nullable().optional(),
  fields_confidence: z.record(z.string(), confidenceSchema).default({}),
});

export const boqItemSchema = z.object({
  item_id: z.string().trim().min(1, "ID item wajib diisi"),
  description: z.string().trim().min(1, "Uraian pekerjaan wajib diisi"),
  unit: z.string().trim().min(1, "Satuan wajib diisi"),
  material_unit_price: z.coerce.number().nonnegative().nullable().optional(),
  service_unit_price: z.coerce.number().nonnegative().nullable().optional(),
  source_page: z.coerce.number().int().positive().nullable().optional(),
  source_text: z.string().trim().nullable().optional(),
  confidence: confidenceSchema,
  warnings: z.array(z.string()).default([]),
});

export const extractionResultSchema = z.object({
  contract: contractMetadataSchema,
  boq_items: z.array(boqItemSchema).min(1, "Minimal satu baris BoQ"),
  confidence_summary: z.object({
    overall: confidenceSchema,
    notes: z.array(z.string()).default([]),
  }),
});

export const draftUpdateSchema = z.object({
  contract: contractMetadataSchema.extend({
    review_notes: z.string().trim().nullable().optional(),
  }),
  items: z.array(boqItemSchema).min(1),
});

export type ContractMetadata = z.infer<typeof contractMetadataSchema>;
export type BoqItemDraft = z.infer<typeof boqItemSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type DraftUpdatePayload = z.infer<typeof draftUpdateSchema>;

export function normalizeUnitName(value: string | null | undefined): {
  unitName: UnitName | null;
  unitRaw: string | null;
} {
  if (!value) {
    return { unitName: null, unitRaw: null };
  }

  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  const match = UNIT_OPTIONS.find((unit) => unit.toLowerCase() === normalized);

  return {
    unitName: match ?? null,
    unitRaw: match ? match : value.trim(),
  };
}

export function parseIndonesianCurrency(
  value: string | number | null | undefined,
) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (!value) {
    return null;
  }

  const cleaned = value
    .replace(/rp/gi, "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!cleaned) {
    return null;
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const hasDecimal = Math.max(lastComma, lastDot) > cleaned.length - 4;
  let normalized = cleaned;

  if (hasDecimal && lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/[,.]/g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["contract", "boq_items", "confidence_summary"],
  properties: {
    contract: {
      type: "object",
      additionalProperties: false,
      required: [
        "contract_number",
        "contract_year",
        "contract_date",
        "vendor_name",
        "unit_name",
        "unit_raw",
        "fields_confidence",
      ],
      properties: {
        contract_number: { type: "string" },
        contract_year: { type: ["integer", "null"] },
        contract_date: {
          type: ["string", "null"],
          description: "Format YYYY-MM-DD. Gunakan null jika tidak terbaca.",
        },
        vendor_name: { type: "string" },
        unit_name: {
          type: ["string", "null"],
          enum: [...UNIT_OPTIONS, null],
        },
        unit_raw: {
          type: ["string", "null"],
          description: "Teks unit asli bila tidak persis cocok dengan enum.",
        },
        fields_confidence: {
          type: "object",
          additionalProperties: { type: ["number", "null"], minimum: 0, maximum: 1 },
        },
      },
    },
    boq_items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "item_id",
          "description",
          "unit",
          "material_unit_price",
          "service_unit_price",
          "source_page",
          "source_text",
          "confidence",
          "warnings",
        ],
        properties: {
          item_id: { type: "string" },
          description: { type: "string" },
          unit: { type: "string" },
          material_unit_price: { type: ["number", "null"] },
          service_unit_price: { type: ["number", "null"] },
          source_page: { type: ["integer", "null"] },
          source_text: { type: ["string", "null"] },
          confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
          warnings: { type: "array", items: { type: "string" } },
        },
      },
    },
    confidence_summary: {
      type: "object",
      additionalProperties: false,
      required: ["overall", "notes"],
      properties: {
        overall: { type: ["number", "null"], minimum: 0, maximum: 1 },
        notes: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

