import { NextResponse } from "next/server";
import {
  apiError,
  createAdminSupabaseClient,
  requireUser,
} from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const auth = await requireUser(request);
    if ("response" in auth) {
      return auth.response;
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("contracts")
      .select(
        `
        id,
        contract_number,
        contract_year,
        contract_date,
        vendor_name,
        unit_name,
        approved_at,
        boq_items(
          id,
          item_id,
          description,
          unit,
          material_unit_price,
          service_unit_price
        )
      `,
      )
      .order("approved_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ contracts: data ?? [] });
  } catch (error) {
    return apiError(error);
  }
}

