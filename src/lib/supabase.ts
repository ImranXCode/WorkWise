import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly in dev rather than silently hitting a blank backend.
  console.error(
    "Missing Supabase env vars. Copy .env.example to .env and fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// TEMPORARY -- for manual RLS testing in the browser console only.
// Remove this before shipping; it just exposes the client on window
// so `window.supabase.from(...)` works from DevTools.
if (import.meta.env.DEV) {
  (window as any).supabase = supabase;
}
