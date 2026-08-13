-- ============================================================================
-- SABAQ / MATHAVERSITY — SIMPLIFIED SCHEMA (v2: unified profile, no roles)
-- ============================================================================
-- Run this once in the Supabase SQL Editor on your new project.
-- Safe to re-run: every statement uses IF NOT EXISTS / CREATE OR REPLACE.
--
-- This is the simpler version: one login, one profile page for everyone.
-- No teacher/student split, no separate resource tables (lessons/worksheets/
-- quizzes), no history/favorites. Just: account + credits + token usage +
-- real per-question practice tracking.
-- ============================================================================


-- ============================================================================
-- 1. PROFILES
-- ============================================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  avatar        text,
  plan          text not null default 'free',
  credits       integer not null default 20,
  tokens_used   bigint not null default 0,
  created_at    timestamptz not null default now(),
  last_login    timestamptz,
  status        text not null default 'active'
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- Auto-create a profile row the moment someone signs up.
-- signup.html must pass full_name via supabase.auth.signUp({ options: { data: { full_name } } }).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- 2. CREDITS & TOKEN USAGE
-- ============================================================================
create table if not exists public.credit_transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  amount              integer not null,          -- negative = spend, positive = grant/refund
  reason              text not null,             -- 'ask_tutor' | 'lesson' | 'ppt_lesson' | 'worksheet' | 'quiz'
  balance_after       integer not null,
  created_at          timestamptz not null default now()
);
create index if not exists idx_credit_transactions_user on public.credit_transactions(user_id);

alter table public.credit_transactions enable row level security;
drop policy if exists "credit_transactions_select_own" on public.credit_transactions;
create policy "credit_transactions_select_own" on public.credit_transactions
  for select using (user_id = auth.uid());
-- No insert/update/delete policy for regular users — rows are only ever
-- written by /api/track-usage.js using the service-role key, so credits
-- can't be forged or altered from the browser.


create table if not exists public.usage_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  tool            text not null,   -- 'ask_tutor' | 'lesson' | 'ppt_lesson' | 'worksheet' | 'quiz'
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  total_tokens    integer not null default 0,
  estimated_cost  numeric(10,6) not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists idx_usage_logs_user on public.usage_logs(user_id);
create index if not exists idx_usage_logs_user_date on public.usage_logs(user_id, created_at);

alter table public.usage_logs enable row level security;
drop policy if exists "usage_logs_select_own" on public.usage_logs;
create policy "usage_logs_select_own" on public.usage_logs
  for select using (user_id = auth.uid());
-- Same as credit_transactions: writes only via the service-role key.


-- ============================================================================
-- 3. PRACTICE PROGRESS (the real per-question tracking — written directly
--    from the browser on each quiz answer, protected by RLS, no credit cost)
-- ============================================================================
create table if not exists public.practice_attempts (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.profiles(id) on delete cascade,
  course              text not null,
  topic               text,
  difficulty          text,
  question            text,
  student_answer      text,
  correct_answer      text,
  is_correct          boolean,
  time_taken_seconds  integer,
  created_at          timestamptz not null default now()
);
create index if not exists idx_practice_attempts_student on public.practice_attempts(student_id);
create index if not exists idx_practice_attempts_topic on public.practice_attempts(student_id, course, topic);

alter table public.practice_attempts enable row level security;
drop policy if exists "practice_attempts_own" on public.practice_attempts;
create policy "practice_attempts_own" on public.practice_attempts
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());


create table if not exists public.topic_mastery (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.profiles(id) on delete cascade,
  course              text not null,
  topic               text not null,
  mastery_percentage  numeric(5,2) not null default 0,
  total_attempts      integer not null default 0,
  correct_attempts    integer not null default 0,
  last_practiced_at   timestamptz,
  updated_at          timestamptz not null default now(),
  unique (student_id, course, topic)
);
create index if not exists idx_topic_mastery_student on public.topic_mastery(student_id);

alter table public.topic_mastery enable row level security;
drop policy if exists "topic_mastery_own" on public.topic_mastery;
create policy "topic_mastery_own" on public.topic_mastery
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

-- ============================================================================
-- DONE. Next: give me this project's URL + anon public key, and I'll wire up
-- the rest (login/signup, profile page, and the app hooks) to point at it.
-- ============================================================================
