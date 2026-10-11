import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  ''
).trim();

if (!supabaseUrl || !supabaseAnonKey) {
  // Both Supabase's legacy anon key and its newer publishable key are safe for browser use.
  // Never use a service-role/secret key in frontend code.
  throw new Error(
    'Supabase configuration missing: set VITE_SUPABASE_URL and either VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY in your deployment environment.'
  );
}
if (!/^https:\/\//i.test(supabaseUrl)) {
  throw new Error('VITE_SUPABASE_URL must be an HTTPS URL in production.');
}
if (String(import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
  // VITE_ variables are public in a browser build. This check cannot undo exposure, but warns loudly.
  console.error('[Hafiz Mart] Do not define a Supabase service-role key with the VITE_ prefix. Rotate it if it was exposed.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    headers: { 'X-Client-Info': 'hafiz-mart-web' },
  },
});
