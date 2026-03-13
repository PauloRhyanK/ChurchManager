import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * Returns a lazily-initialized read-only Supabase client, or null when
 * environment variables are absent (e.g., during a static build without .env.local).
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (_client) return _client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  _client = createClient(supabaseUrl, supabaseAnonKey);
  return _client;
}
