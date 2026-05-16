import { NextResponse } from "next/server";
import { z } from "zod";
import { CONTRACT_PDF_BUCKET, MAX_PDF_BYTES } from "@/lib/constants";
import {
  apiError,
  createAdminSupabaseClient,
  requireUser,
} from "@/lib/supabase/server";

const createDocumentSchema = z.object({
  storagePath: z.string().min(1),
  filename: z.string().min(1),
  fileSize: z.number().int().positive().max(MAX_PDF_BYTES),
  mimeType: z.string().default("application/pdf"),
});

export async function GET(request: Request) {
  try {
    const auth = await requireUser(request);
    if ("response" in auth) {
      return auth.response;
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("documents")
      .select(
        `
        id,
        original_filename,
        status,
        file_size_bytes,
        error_message,
        created_at,
        extraction_jobs(status, model),
        contract_extraction_drafts(contract_number, vendor_name, unit_name, unit_raw)
      `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ documents: data ?? [] });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser(request);
    if ("response" in auth) {
      return auth.response;
    }

    const payload = createDocumentSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({
        uploaded_by: auth.user.id,
        original_filename: payload.filename,
        storage_bucket: CONTRACT_PDF_BUCKET,
        storage_path: payload.storagePath,
        mime_type: payload.mimeType,
        file_size_bytes: payload.fileSize,
        status: "uploaded",
      })
      .select("*")
      .single();

    if (documentError) {
      throw documentError;
    }

    const { error: jobError } = await supabase.from("extraction_jobs").insert({
      document_id: document.id,
      status: "queued",
      model: process.env.OPENAI_MODEL ?? "gpt-5.2",
    });

    if (jobError) {
      throw jobError;
    }

    const { error: invokeError } = await supabase.functions.invoke(
      "process-contract",
      {
        body: { documentId: document.id },
      },
    );

    if (invokeError) {
      await supabase
        .from("documents")
        .update({
          status: "failed",
          error_message: `Gagal memicu proses ekstraksi: ${invokeError.message}`,
        })
        .eq("id", document.id);
      throw invokeError;
    }

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 422 : 500;
    return apiError(error, status);
  }
}

