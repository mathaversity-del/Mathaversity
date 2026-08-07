/* ============================================================================
   SABAQ — Nav account UI + credit pre-check + usage tracking.
   Loaded on index.html (after supabaseClient.js) so the existing generators
   can call sabaqCheckCredits()/sabaqTrackUsage() at their existing success
   points without any change to their own generation logic.
   ============================================================================ */

const SABAQ_CREDIT_COSTS = {
  ask_tutor: 1,
  quiz: 2,
  worksheet: 3,
  lesson: 5,
  ppt_lesson: 8,
  flashcards: 2,
};

let sabaqProfile = null;   // cached profile row for the logged-in user, or null if logged out
let sabaqSession = null;

/** Renders the nav's account area based on current auth state. */
function sabaqRenderNav(){
  const el = document.getElementById('navAccount');
  if(!el) return;

  if(sabaqProfile){
    const dash = sabaqProfile.role === 'teacher' ? '/teacher-dashboard.html' : '/student-dashboard.html';
    el.innerHTML =
      '<span class="nav-credits">' + sabaqProfile.credits + ' credits</span>' +
      '<button onclick="location.href=\'' + dash + '\'">Dashboard</button>' +
      '<button onclick="sabaqLogout()">Log out</button>';
  } else {
    el.innerHTML =
      '<button onclick="location.href=\'/login.html\'">Log in</button>' +
      '<button class="primary" onclick="location.href=\'/signup.html\'">Sign up</button>';
  }
}

/** Loads the current session + profile (if any) and renders the nav. Safe to call even if logged out. */
async function sabaqInitNav(){
  const { data: { session } } = await sabaqSupabase.auth.getSession();
  sabaqSession = session;

  if(session){
    const { data: profile } = await sabaqSupabase.from('profiles').select('*').eq('id', session.user.id).single();
    sabaqProfile = profile || null;
  } else {
    sabaqProfile = null;
  }

  sabaqRenderNav();
}

/**
 * Call at the START of a generator (before any Claude requests) to confirm
 * the visitor is logged in and has enough credits for `tool`. Returns true/false.
 * On failure it shows a message in `statusElId` (if given) rather than throwing,
 * so callers can just `if(!(await sabaqCheckCredits('lesson', 'lsStatus'))) return;`
 */
async function sabaqCheckCredits(tool, statusElId){
  const cost = SABAQ_CREDIT_COSTS[tool];
  const statusEl = statusElId ? document.getElementById(statusElId) : null;

  if(!sabaqSession){
    if(statusEl){
      statusEl.textContent = 'Please log in to use this feature.';
      statusEl.classList.add('error');
    }
    setTimeout(() => { window.location.href = '/login.html'; }, 900);
    return false;
  }

  if(!sabaqProfile || sabaqProfile.credits < cost){
    if(statusEl){
      statusEl.textContent = 'Not enough credits for this (' + cost + ' needed, ' + (sabaqProfile ? sabaqProfile.credits : 0) + ' remaining).';
      statusEl.classList.add('error');
    }
    return false;
  }

  return true;
}

/**
 * Call at the EXISTING success point of a generator to deduct credits, log
 * token usage, and save the resource + history row. Never call this on a
 * failure path — that's what keeps "never deduct credits on failure" true.
 * Returns the server response ({credits, tokensUsed, resourceId}) or null on error.
 */
async function sabaqTrackUsage(params){
  if(!sabaqSession) return null;

  try{
    const res = await fetch('/api/track-usage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + sabaqSession.access_token,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if(!res.ok){
      console.error('sabaqTrackUsage failed:', data.error);
      return null;
    }

    if(sabaqProfile){
      sabaqProfile.credits = data.credits;
      sabaqProfile.tokens_used = data.tokensUsed;
      sabaqRenderNav();
    }
    return data;
  }catch(err){
    console.error('sabaqTrackUsage error:', err);
    return null;
  }
}

// ---- Token accumulation across a generator's (possibly batched) Claude calls ----
// callClaude() in index.html stashes each response's usage here; generators
// drain it with sabaqTakeUsage() right after each call to keep a running total.
let __sabaqLastUsage = { input_tokens: 0, output_tokens: 0 };

function sabaqStashUsage(usage){
  __sabaqLastUsage = usage || { input_tokens: 0, output_tokens: 0 };
}

function sabaqTakeUsage(){
  const u = __sabaqLastUsage;
  __sabaqLastUsage = { input_tokens: 0, output_tokens: 0 };
  return u;
}

document.addEventListener('DOMContentLoaded', sabaqInitNav);
