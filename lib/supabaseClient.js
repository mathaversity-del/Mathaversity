/* ============================================================================
   SABAQ — Shared Supabase client.
   Include the Supabase CDN script BEFORE this file on every page that needs it:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script src="/lib/supabaseClient.js"></script>
   ============================================================================ */

// TODO: replace with your new Supabase project's URL + anon public key
// (Project Settings → API in the Supabase dashboard — the "anon / public" key,
// not the secret service_role key).
const SABAQ_SUPABASE_URL = 'PASTE_YOUR_SUPABASE_PROJECT_URL_HERE';
const SABAQ_SUPABASE_ANON_KEY = 'PASTE_YOUR_SUPABASE_ANON_KEY_HERE';

// Exposed as a single global so every page can just call `sabaqSupabase.auth...` /
// `sabaqSupabase.from(...)` without re-initializing the client.
const sabaqSupabase = supabase.createClient(SABAQ_SUPABASE_URL, SABAQ_SUPABASE_ANON_KEY);
