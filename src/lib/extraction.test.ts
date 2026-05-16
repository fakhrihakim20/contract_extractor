import { describe, expect, it } from "vitest";
import {
  extractionResultSchema,
  normalizeUnitName,
  parseIndonesianCurrency,
} from "@/lib/extraction";

describe("extraction helpers", () => {
  it("parses Indonesian currency formats", () => {
    expect(parseIndonesianCurrency("Rp 1.250.000")).toBe(1250000);
    expect(parseIndonesianCurrency("1.250.000,50")).toBe(1250000.5);
    expect(parseIndonesianCurrency("bad-data")).toBeNull();
  });

  it("normalizes known units and preserves unknown unit text", () => {
    expect(normalizeUnitName("upt surabaya")).toEqual({
      unitName: "UPT Surabaya",
      unitRaw: "UPT Surabaya",
    });
    expect(normalizeUnitName("UPT Semarang")).toEqual({
      unitName: null,
      unitRaw: "UPT Semarang",
    });
  });

  it("validates a complete extraction payload", () => {
    const result = extractionResultSchema.safeParse({
      contract: {
        contract_number: "001/SPK/2026",
        contract_year: 2026,
        contract_date: "2026-05-16",
        vendor_name: "PT Contoh Vendor",
        unit_name: "UPT Gresik",
        unit_raw: "UPT Gresik",
        fields_confidence: { contract_number: 0.9 },
      },
      boq_items: [
        {
          item_id: "1",
          description: "Pekerjaan pondasi",
          unit: "LS",
          material_unit_price: 1000000,
          service_unit_price: null,
          source_page: 4,
          source_text: "1 Pekerjaan pondasi LS",
          confidence: 0.85,
          warnings: [],
        },
      ],
      confidence_summary: { overall: 0.84, notes: [] },
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid contract dates", () => {
    const result = extractionResultSchema.safeParse({
      contract: {
        contract_number: "001/SPK/2026",
        contract_year: 2026,
        contract_date: "16/05/2026",
        vendor_name: "PT Contoh Vendor",
        unit_name: "UPT Gresik",
        unit_raw: "UPT Gresik",
        fields_confidence: {},
      },
      boq_items: [
        {
          item_id: "1",
          description: "Pekerjaan pondasi",
          unit: "LS",
          material_unit_price: null,
          service_unit_price: null,
          source_page: null,
          source_text: null,
          confidence: null,
          warnings: ["Harga tidak terbaca"],
        },
      ],
      confidence_summary: { overall: null, notes: [] },
    });

    expect(result.success).toBe(false);
  });
});

