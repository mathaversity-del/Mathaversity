/* ============================================================================
   SABAQ — Auth guard & shared session helpers.
   Include AFTER supabaseClient.js:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script src="/lib/supabaseClient.js"></script>
   <script src="/lib/auth-guard.js"></script>
   ============================================================================ */

/**
 * Ensures the visitor is logged in, redirecting to /login.html if not.
 * If `allowedRoles` is given (e.g. ['teacher']) and the profile's role isn't
 * in that list, redirects to that role's own dashboard instead of granting access.
 * Returns { session, profile } on success — callers should await this before
 * rendering anything that depends on the user's data.
 */
async function sabaqRequireAuth(allowedRoles) {
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
    // Session exists but no profile row yet (e.g. email not verified, trigger
    // hasn't run) — send back to login rather than showing a broken dashboard.
    window.location.href = '/login.html';
    return null;
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length && !allowedRoles.includes(profile.role)) {
    window.location.href = profile.role === 'teacher' ? '/teacher-dashboard.html' : '/student-dashboard.html';
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

/** Small helper for pages that just need to know "is anyone logged in" without enforcing a role. */
async function sabaqGetSession() {
  const { data: { session } } = await sabaqSupabase.auth.getSession();
  return session;
}
