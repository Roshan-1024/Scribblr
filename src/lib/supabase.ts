import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import config from 'scribblr-config';

export const isConfigured = Boolean(config.supabaseAnonKey && /^https:\/\/[^/]+$/.test(config.supabaseUrl) && !config.supabaseUrl.includes('YOUR-PROJECT'));

export const supabase: SupabaseClient = createClient(
  config.supabaseUrl || 'http://localhost:54321',
  config.supabaseAnonKey || 'missing',
  {
    // Session is kept in localStorage so the device stays signed in.
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'scribblr-auth' },
    realtime: { params: { eventsPerSecond: 40 } },
  },
);

export type Profile = {
  id: string;
  email: string | null;
  display_name: string;
  color: string;
  is_admin: boolean;
};

/** Turn Postgres / auth errors into short human messages. */
export function errMsg(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  if (/rate limit/i.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
  return m;
}
