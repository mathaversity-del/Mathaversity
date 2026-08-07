-- ============================================================================
-- SABAQ / MATHAVERSITY — SUPABASE SCHEMA
-- ============================================================================
-- Run this once in the Supabase SQL Editor on a fresh project.
-- Safe to re-run: every statement uses IF NOT EXISTS / CREATE OR REPLACE.
--
-- Design notes:
--   * The math curriculum (courses/chapters/topics) already lives in
--     index.html's COURSE_GROUPS/COURSES objects. We deliberately do NOT
--     duplicate it here — "course", "chapter", "topic" columns below are
--     plain text and should match those JS keys exactly, so the dashboard
--     can join on the same names without a second source of truth.
--   * "lessons" and "ppt_lessons" are kept as two separate tables per your
--     instruction, even though today both come from one Lesson Studio
--     feature — see the mapping note in chat.
-- ============================================================================


-- ============================================================================
-- 1. PROFILES
-- ============================================================================
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null,
  full_name           text,
  role                text not null check (role in ('teacher','student')),
  avatar              text,
  plan                text not null default 'free',
  credits             integer not null default 20,
  tokens_used         bigint not null default 0,
  created_at          timestamptz not null default now(),
  last_login          timestamptz,
  status              text not null default 'active',
  subscription_status text not null default 'free'
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- Auto-create a profile row the moment someone confirms their email.
-- The signup form must pass role + full_name via supabase.auth.signUp({ options: { data: { role, full_name } } }).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'student')
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
-- 2. STUDENT PROGRESS
-- ============================================================================
create table if not exists public.course_progress (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.profiles(id) on delete cascade,
  course              text not null,
  chapter             text,
  topic               text,
  mastery_percentage  numeric(5,2) not null default 0,
  accuracy            numeric(5,2) not null default 0,
  last_practiced_at   timestamptz,
  updated_at          timestamptz not null default now()
);
create index if not exists idx_course_progress_student on public.course_progress(student_id);

alter table public.course_progress enable row level security;
drop policy if exists "course_progress_own" on public.course_progress;
create policy "course_progress_own" on public.course_progress
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());


create table if not exists public.practice_attempts (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.profiles(id) on delete cascade,
  course            text not null,
  subject           text,
  grade             text,
  topic             text,
  subtopic          text,
  difficulty        text,
  question          text,
  student_answer    text,
  correct_answer    text,
  is_correct        boolean,
  time_taken_seconds integer,
  attempt_number    integer default 1,
  hints_used        integer default 0,
  created_at        timestamptz not null default now()
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
  accuracy            numeric(5,2) not null default 0,
  total_attempts      integer not null default 0,
  correct_attempts    integer not null default 0,
  avg_response_time   numeric(8,2),
  trend               text check (trend in ('improving','declining','stable')),
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
-- 3. GENERATED RESOURCES (teacher-authored)
-- ============================================================================
create table if not exists public.lessons (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references public.profiles(id) on delete cascade,
  title             text not null,
  course            text not null,
  chapter           text,
  topics            text[] default '{}',
  slide_count       integer,
  color_scheme      text,
  prompt_used       text,
  credits_consumed  integer not null default 0,
  tokens_used       integer not null default 0,
  download_url      text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_lessons_teacher on public.lessons(teacher_id);

alter table public.lessons enable row level security;
drop policy if exists "lessons_own" on public.lessons;
create policy "lessons_own" on public.lessons
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());


create table if not exists public.ppt_lessons (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references public.profiles(id) on delete cascade,
  lesson_id         uuid references public.lessons(id) on delete set null,
  title             text not null,
  course            text not null,
  credits_consumed  integer not null default 0,
  download_url      text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_ppt_lessons_teacher on public.ppt_lessons(teacher_id);

alter table public.ppt_lessons enable row level security;
drop policy if exists "ppt_lessons_own" on public.ppt_lessons;
create policy "ppt_lessons_own" on public.ppt_lessons
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());


create table if not exists public.worksheets (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references public.profiles(id) on delete cascade,
  title             text not null,
  course            text not null,
  chapter           text,
  topics            text[] default '{}',
  question_count    integer,
  style             text,
  prompt_used       text,
  credits_consumed  integer not null default 0,
  tokens_used       integer not null default 0,
  download_url      text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_worksheets_teacher on public.worksheets(teacher_id);

alter table public.worksheets enable row level security;
drop policy if exists "worksheets_own" on public.worksheets;
create policy "worksheets_own" on public.worksheets
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());


create table if not exists public.quizzes (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references public.profiles(id) on delete cascade,
  title             text not null,
  course            text not null,
  chapter           text,
  topics            text[] default '{}',
  question_count    integer,
  difficulty        text,
  question_type     text,
  credits_consumed  integer not null default 0,
  tokens_used       integer not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists idx_quizzes_teacher on public.quizzes(teacher_id);

alter table public.quizzes enable row level security;
drop policy if exists "quizzes_own" on public.quizzes;
create policy "quizzes_own" on public.quizzes
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());


-- ============================================================================
-- 4. HISTORY / FAVORITES
-- ============================================================================
create table if not exists public.history (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  resource_type  text not null check (resource_type in ('lesson','ppt_lesson','worksheet','quiz','flashcards')),
  resource_id    uuid not null,
  title          text,
  is_favourite   boolean not null default false,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_history_user on public.history(user_id);
create index if not exists idx_history_user_active on public.history(user_id) where deleted_at is null;

alter table public.history enable row level security;
drop policy if exists "history_own" on public.history;
create policy "history_own" on public.history
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


create table if not exists public.saved_resources (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  resource_type  text not null,
  resource_id    uuid not null,
  title          text,
  created_at     timestamptz not null default now(),
  unique (user_id, resource_type, resource_id)
);
create index if not exists idx_saved_resources_user on public.saved_resources(user_id);

alter table public.saved_resources enable row level security;
drop policy if exists "saved_resources_own" on public.saved_resources;
create policy "saved_resources_own" on public.saved_resources
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ============================================================================
-- 5. CREDITS & TOKEN USAGE
-- ============================================================================
create table if not exists public.credit_transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  amount              integer not null,          -- negative = spend, positive = grant/refund
  reason              text not null,             -- e.g. 'lesson_generated', 'ppt_export', 'quiz_generated'
  related_resource_id uuid,
  balance_after       integer not null,
  created_at          timestamptz not null default now()
);
create index if not exists idx_credit_transactions_user on public.credit_transactions(user_id);

alter table public.credit_transactions enable row level security;
drop policy if exists "credit_transactions_select_own" on public.credit_transactions;
create policy "credit_transactions_select_own" on public.credit_transactions
  for select using (user_id = auth.uid());
-- NOTE: no insert/update/delete policy for regular users — rows are only
-- ever written by /api/track-usage.js using the Supabase service-role key,
-- so credits can't be forged or altered from the browser.


create table if not exists public.usage_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  tool            text not null,   -- 'ask_tutor' | 'lesson' | 'ppt_lesson' | 'worksheet' | 'quiz' | 'flashcards'
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
-- 6. SETTINGS
-- ============================================================================
create table if not exists public.user_settings (
  user_id               uuid primary key references public.profiles(id) on delete cascade,
  default_grade         text,
  default_course        text,
  theme                 text default 'light',
  notification_prefs    jsonb default '{}'::jsonb,
  updated_at            timestamptz not null default now()
);

alter table public.user_settings enable row level security;
drop policy if exists "user_settings_own" on public.user_settings;
create policy "user_settings_own" on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ============================================================================
-- DONE. Next steps (in chat, not here):
--   1. Give me this project's URL + anon public key.
--   2. I'll add the Supabase service-role key to Vercel's env vars (you paste
--      it directly into Vercel's dashboard — it should never touch GitHub).
--   3. Then I'll write lib/supabaseClient.js, the auth pages, both
--      dashboards, and /api/track-usage.js, and show you each one before
--      anything is committed.
-- ============================================================================
