/* ============================================================================
   SABAQ — Shared Supabase client.
   Include the Supabase CDN script BEFORE this file on every page that needs it:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script src="/lib/supabaseClient.js"></script>
   ============================================================================ */

const SABAQ_SUPABASE_URL = 'https://xonpimiptnkdzbipkxgs.supabase.co';
const SABAQ_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvbnBpbWlwdG5rZHpiaXBreGdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwOTY0NjMsImV4cCI6MjEwMTY3MjQ2M30.x24-8LbUm6xWBm1fkLH0tqtw4zi03JPczULeQXPb1dE';

// Exposed as a single global so every page can just call `sabaqSupabase.auth...` /
// `sabaqSupabase.from(...)` without re-initializing the client.
const sabaqSupabase = supabase.createClient(SABAQ_SUPABASE_URL, SABAQ_SUPABASE_ANON_KEY);
