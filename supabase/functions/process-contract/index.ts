import { createClient } from "@supabase/supabase-js";

type ContractExtraction = {
  contract: {
    contract_number: string;
    contract_year: number | null;
    contract_date: string | null;
    vendor_name: string;
    unit_name: string | null;
    unit_raw: string | null;
    fields_confidence: Record<string, number | null>;
  };
  boq_items: Array<{
    item_id: string;
    description: string;
    unit: string;
    material_unit_price: number | string | null;
    service_unit_price: number | string | null;
    source_page: number | null;
    source_text: string | null;
    confidence: number | null;
    warnings: string[];
  }>;
  confidence_summary: {
    overall: number | null;
    notes: string[];
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedUnits = [
  "UIT JBM",
  "UPT Probolinggo",
  "UPT Surabaya",
  "UPT Gresik",
  "UPT Malang",
  "UPT Madiun",
] as const;

const extractionSchema = {
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
        contract_date: { type: ["string", "null"] },
        vendor_name: { type: "string" },
        unit_name: { type: ["string", "null"], enum: [...allowedUnits, null] },
        unit_raw: { type: ["string", "null"] },
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
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseNumber(value: number | string | null | undefined) {
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
  const normalized =
    hasDecimal && lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/[,.]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUnit(value: string | null) {
  if (!value) {
    return { unitName: null, unitRaw: null };
  }

  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  const match = allowedUnits.find((unit) => unit.toLowerCase() === normalized) ?? null;
  return {
    unitName: match,
    unitRaw: match ?? value.trim(),
  };
}

function extractOutputText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") {
        return text;
      }
    }
  }

  throw new Error("OpenAI response tidak berisi output text.");
}

async function processDocument(documentId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-5.2";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum tersedia.");
  }

  if (!openAiKey) {
    throw new Error("OPENAI_API_KEY belum diset di Supabase Edge Function secrets.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const markFailed = async (message: string) => {
    await supabase
      .from("documents")
      .update({ status: "failed", error_message: message })
      .eq("id", documentId);
    await supabase
      .from("extraction_jobs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("document_id", documentId);
  };

  try {
    await supabase
      .from("documents")
      .update({ status: "processing", error_message: null })
      .eq("id", documentId);
    await supabase
      .from("extraction_jobs")
      .upsert(
        {
          document_id: documentId,
          status: "processing",
          model,
          error_message: null,
          started_at: new Date().toISOString(),
        },
        { onConflict: "document_id" },
      );

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("id, original_filename, storage_bucket, storage_path")
      .eq("id", documentId)
      .single();

    if (documentError) throw documentError;

    const { data: pdfBlob, error: downloadError } = await supabase.storage
      .from(document.storage_bucket)
      .download(document.storage_path);

    if (downloadError) throw downloadError;

    const fileForm = new FormData();
    fileForm.append("purpose", "user_data");
    fileForm.append(
      "file",
      new Blob([await pdfBlob.arrayBuffer()], { type: "application/pdf" }),
      document.original_filename,
    );

    const fileResponse = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: fileForm,
    });

    if (!fileResponse.ok) {
      throw new Error(`OpenAI file upload gagal: ${await fileResponse.text()}`);
    }

    const uploadedFile = (await fileResponse.json()) as { id: string };

    const prompt = [
      "Anda adalah ekstraktor kontrak konstruksi/pekerjaan PLN.",
      "Baca PDF scan kontrak berikut dan ekstrak metadata kontrak serta seluruh baris BoQ.",
      "Gunakan bahasa asli dokumen untuk uraian pekerjaan.",
      "Nama unit hanya boleh salah satu dari enum. Jika teks unit tidak cocok persis, isi unit_name null dan unit_raw dengan teks aslinya.",
      "Harga harus angka Rupiah tanpa simbol dan tanpa pemisah ribuan. Jika harga tidak terbaca, isi null dan tambahkan warning.",
      "Tanggal kontrak wajib format YYYY-MM-DD jika terbaca.",
      "Sertakan source_page dan source_text pendek jika tersedia.",
    ].join("\n");

    const responsePayload = {
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", file_id: uploadedFile.id },
            { type: "input_text", text: prompt },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "contract_boq_extraction",
          strict: true,
          schema: extractionSchema,
        },
      },
    };

    const extractionResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(responsePayload),
    });

    const rawOutput = (await extractionResponse.json()) as Record<string, unknown>;
    if (!extractionResponse.ok) {
      throw new Error(`OpenAI extraction gagal: ${JSON.stringify(rawOutput)}`);
    }

    const parsed = JSON.parse(extractOutputText(rawOutput)) as ContractExtraction;
    const unit = normalizeUnit(parsed.contract.unit_name ?? parsed.contract.unit_raw);
    const contractDate =
      parsed.contract.contract_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.contract.contract_date)
        ? parsed.contract.contract_date
        : null;

    const { data: draft, error: draftError } = await supabase
      .from("contract_extraction_drafts")
      .upsert(
        {
          document_id: documentId,
          contract_number: parsed.contract.contract_number?.trim() || null,
          contract_year: parsed.contract.contract_year,
          contract_date: contractDate,
          vendor_name: parsed.contract.vendor_name?.trim() || null,
          unit_name: unit.unitName,
          unit_raw: unit.unitRaw,
          fields_confidence: parsed.contract.fields_confidence ?? {},
        },
        { onConflict: "document_id" },
      )
      .select("*")
      .single();

    if (draftError) throw draftError;

    const { error: deleteError } = await supabase
      .from("boq_extraction_draft_items")
      .delete()
      .eq("document_id", documentId);

    if (deleteError) throw deleteError;

    const draftItems = parsed.boq_items.map((item, index) => ({
      document_id: documentId,
      draft_id: draft.id,
      sort_order: index + 1,
      item_id: item.item_id?.trim() || `${index + 1}`,
      description: item.description?.trim() || "Uraian tidak terbaca",
      unit: item.unit?.trim() || "-",
      material_unit_price: parseNumber(item.material_unit_price),
      service_unit_price: parseNumber(item.service_unit_price),
      source_page: item.source_page,
      source_text: item.source_text,
      confidence: item.confidence,
      warnings: item.warnings ?? [],
    }));

    if (draftItems.length > 0) {
      const { error: itemsError } = await supabase
        .from("boq_extraction_draft_items")
        .insert(draftItems);
      if (itemsError) throw itemsError;
    }

    await supabase
      .from("extraction_jobs")
      .update({
        status: "succeeded",
        raw_output: rawOutput,
        confidence_summary: parsed.confidence_summary ?? {},
        completed_at: new Date().toISOString(),
      })
      .eq("document_id", documentId);

    await supabase
      .from("documents")
      .update({ status: "needs_review", error_message: null })
      .eq("id", documentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ekstraksi gagal.";
    await markFailed(message);
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { documentId } = (await req.json()) as { documentId?: string };
    if (!documentId) {
      return json({ error: "documentId wajib diisi" }, 422);
    }

    const task = processDocument(documentId);
    const edgeRuntime = (
      globalThis as typeof globalThis & {
        EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
      }
    ).EdgeRuntime;

    if (edgeRuntime?.waitUntil) {
      edgeRuntime.waitUntil(task);
      return json({ queued: true });
    }

    await task;
    return json({ queued: false, completed: true });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Request gagal" },
      500,
    );
  }
});

