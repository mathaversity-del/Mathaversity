/* ============================================================================
   SABAQ — Nav account UI, credit pre-check, usage tracking, and practice
   progress logging. Loaded on index.html so the existing generators/quiz can
   call these at their existing points without any change to their own logic.
   ============================================================================ */

const SABAQ_CREDIT_COSTS = {
  ask_tutor: 1,
  quiz: 2,
  worksheet: 3,
  lesson: 5,
  ppt_lesson: 8,
};

let sabaqProfile = null;
let sabaqSession = null;

function sabaqRenderNav(){
  const el = document.getElementById('navAccount');
  if(!el) return;

  if(sabaqProfile){
    el.innerHTML =
      '<span class="nav-credits">' + sabaqProfile.credits + ' credits</span>' +
      '<button onclick="location.href=\'/profile.html\'">Profile</button>' +
      '<button onclick="sabaqLogout()">Log out</button>';
  } else {
    el.innerHTML =
      '<button onclick="location.href=\'/login.html\'">Log in</button>' +
      '<button class="primary" onclick="location.href=\'/signup.html\'">Sign up</button>';
  }
}

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

/** Call at the START of a generator to confirm login + enough credits for `tool`. */
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

/** Call at the EXISTING success point of a generator to deduct credits + log token usage. */
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
let __sabaqLastUsage = { input_tokens: 0, output_tokens: 0 };
function sabaqStashUsage(usage){ __sabaqLastUsage = usage || { input_tokens: 0, output_tokens: 0 }; }
function sabaqTakeUsage(){
  const u = __sabaqLastUsage;
  __sabaqLastUsage = { input_tokens: 0, output_tokens: 0 };
  return u;
}

/**
 * Logs one answered practice question directly to Supabase (RLS-protected —
 * a signed-in student can only ever write their own rows) and rolls it into
 * that topic's running mastery stats. No credit cost, no server round-trip.
 * Safe to call even if logged out — it just no-ops.
 */
async function sabaqLogPracticeAttempt(params){
  if(!sabaqSession) return;

  const studentId = sabaqSession.user.id;
  const course = params.course || '';
  const topic = params.topic || '';

  try{
    await sabaqSupabase.from('practice_attempts').insert({
      student_id: studentId,
      course: course,
      topic: topic,
      difficulty: params.difficulty || null,
      question: params.question || null,
      student_answer: params.studentAnswer || null,
      correct_answer: params.correctAnswer || null,
      is_correct: !!params.isCorrect,
      time_taken_seconds: params.timeTakenSeconds || null,
    });

    if(!topic) return;

    const { data: existing } = await sabaqSupabase
      .from('topic_mastery')
      .select('*')
      .eq('student_id', studentId)
      .eq('course', course)
      .eq('topic', topic)
      .maybeSingle();

    const totalAttempts = (existing ? existing.total_attempts : 0) + 1;
    const correctAttempts = (existing ? existing.correct_attempts : 0) + (params.isCorrect ? 1 : 0);
    const masteryPct = Math.round((correctAttempts / totalAttempts) * 10000) / 100;

    await sabaqSupabase.from('topic_mastery').upsert({
      student_id: studentId,
      course: course,
      topic: topic,
      mastery_percentage: masteryPct,
      total_attempts: totalAttempts,
      correct_attempts: correctAttempts,
      last_practiced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id,course,topic' });
  }catch(err){
    console.error('sabaqLogPracticeAttempt error:', err);
  }
}

document.addEventListener('DOMContentLoaded', sabaqInitNav);
