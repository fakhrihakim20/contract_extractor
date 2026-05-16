"use client";

import { createClient } from "@supabase/supabase-js";

export function getBrowserSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return {
    url,
    key,
    isConfigured: Boolean(url && key),
  };
}

export function createBrowserSupabaseClient() {
  const { url, key } = getBrowserSupabaseConfig();

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
