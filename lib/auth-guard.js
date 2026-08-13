/* ============================================================================
   SABAQ — Auth guard & shared session helpers (unified, no roles).
   Include AFTER supabaseClient.js:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script src="/lib/supabaseClient.js"></script>
   <script src="/lib/auth-guard.js"></script>
   ============================================================================ */

/**
 * Ensures the visitor is logged in, redirecting to /login.html if not.
 * Returns { session, profile } on success — callers should await this before
 * rendering anything that depends on the user's data.
 */
async function sabaqRequireAuth() {
  const { data: { session }, error: sessionError } = await sabaqSupabase.auth.getSession();

  if (sessionError || !session) {
    window.location.href = '/login.html';
    return null;
  }

  const { data: profile, error: profileError } = await sabaqSupabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile) {
    window.location.href = '/login.html';
    return null;
  }

  // Best-effort last_login stamp — never blocks page load if it fails.
  sabaqSupabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', session.user.id).then(
    () => {}, () => {}
  );

  return { session, profile };
}

/** Signs the current user out and returns to the login page. */
async function sabaqLogout() {
  await sabaqSupabase.auth.signOut();
  window.location.href = '/login.html';
}
