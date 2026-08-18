import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Browser-side Supabase client for use in Client Components. Throws early
 * with a clear message if env vars are missing, rather than letting
 * @supabase/ssr fail deep inside a fetch call.
 */
export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is NOT CONFIGURED — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env",
    );
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
