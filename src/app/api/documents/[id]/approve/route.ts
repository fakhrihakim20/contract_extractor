import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiError,
  createAdminSupabaseClient,
  requireUser,
} from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireUser(request);
    if ("response" in auth) {
      return auth.response;
    }

    const params = await context.params;
    const documentId = z.string().uuid().parse(params.id);
    const supabase = createAdminSupabaseClient();

    const { data, error } = await supabase.rpc("approve_contract_document", {
      p_document_id: documentId,
      p_approved_by: auth.user.id,
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({ contractId: data });
  } catch (error) {
    return apiError(error);
  }
}

