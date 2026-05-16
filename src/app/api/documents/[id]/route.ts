import { NextResponse } from "next/server";
import { z } from "zod";
import { draftUpdateSchema } from "@/lib/extraction";
import {
  apiError,
  createAdminSupabaseClient,
  requireUser,
} from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function getDocumentId(context: RouteContext) {
  const params = await context.params;
  return z.string().uuid().parse(params.id);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireUser(request);
    if ("response" in auth) {
      return auth.response;
    }

    const id = await getDocumentId(context);
    const supabase = createAdminSupabaseClient();

    const [{ data: document, error: documentError }, { data: job }, { data: draft }] =
      await Promise.all([
        supabase.from("documents").select("*").eq("id", id).single(),
        supabase
          .from("extraction_jobs")
          .select("*")
          .eq("document_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("contract_extraction_drafts")
          .select("*")
          .eq("document_id", id)
          .maybeSingle(),
      ]);

    if (documentError) {
      throw documentError;
    }

    const { data: items, error: itemsError } = await supabase
      .from("boq_extraction_draft_items")
      .select("*")
      .eq("document_id", id)
      .order("sort_order", { ascending: true });

    if (itemsError) {
      throw itemsError;
    }

    return NextResponse.json({
      document,
      job,
      draft,
      items: items ?? [],
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireUser(request);
    if ("response" in auth) {
      return auth.response;
    }

    const id = await getDocumentId(context);
    const payload = draftUpdateSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    const { data: draft, error: draftError } = await supabase
      .from("contract_extraction_drafts")
      .upsert(
        {
          document_id: id,
          contract_number: payload.contract.contract_number,
          contract_year: payload.contract.contract_year,
          contract_date: payload.contract.contract_date,
          vendor_name: payload.contract.vendor_name,
          unit_name: payload.contract.unit_name,
          unit_raw: payload.contract.unit_raw,
          fields_confidence: payload.contract.fields_confidence,
          review_notes: payload.contract.review_notes,
        },
        { onConflict: "document_id" },
      )
      .select("*")
      .single();

    if (draftError) {
      throw draftError;
    }

    const { error: deleteError } = await supabase
      .from("boq_extraction_draft_items")
      .delete()
      .eq("document_id", id);

    if (deleteError) {
      throw deleteError;
    }

    const rows = payload.items.map((item, index) => ({
      document_id: id,
      draft_id: draft.id,
      sort_order: index + 1,
      item_id: item.item_id,
      description: item.description,
      unit: item.unit,
      material_unit_price: item.material_unit_price,
      service_unit_price: item.service_unit_price,
      source_page: item.source_page,
      source_text: item.source_text,
      confidence: item.confidence,
      warnings: item.warnings,
    }));

    const { error: insertError } = await supabase
      .from("boq_extraction_draft_items")
      .insert(rows);

    if (insertError) {
      throw insertError;
    }

    await supabase
      .from("documents")
      .update({ status: "needs_review", error_message: null })
      .eq("id", id);

    return NextResponse.json({ draft, items: rows });
  } catch (error) {
    const status = error instanceof z.ZodError ? 422 : 500;
    return apiError(error, status);
  }
}

