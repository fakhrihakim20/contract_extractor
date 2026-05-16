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

    await supabase
      .from("extraction_jobs")
      .upsert(
        {
          document_id: documentId,
          status: "queued",
          model: process.env.OPENAI_MODEL ?? "gpt-5.2",
          error_message: null,
        },
        { onConflict: "document_id" },
      );

    const { error } = await supabase.functions.invoke("process-contract", {
      body: { documentId },
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

