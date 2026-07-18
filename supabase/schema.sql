-- ============================================================
--  SyncDEV — Supabase PostgreSQL Schema
--  Run this ONCE in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. PROFILES (extends Supabase auth.users)
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  name        text not null default '',
  avatar_url  text default 'https://picsum.photos/seed/student-alex/80/80.jpg',
  streak      int  not null default 0,
  created_at  timestamptz default now()
);

-- 2. SUBJECTS (syllabus subjects per user)
create table if not exists public.subjects (
  id          text not null,
  user_id     uuid references auth.users on delete cascade not null,
  name        text not null,
  progress    int  not null default 0,
  sort_order  int  not null default 0,
  created_at  timestamptz default now(),
  primary key (id, user_id)
);

-- 3. CHAPTERS (inside subjects)
create table if not exists public.chapters (
  id          text not null,
  user_id     uuid references auth.users on delete cascade not null,
  subject_id  text not null,
  name        text not null,
  sort_order  int  not null default 0,
  primary key (id, user_id)
);

-- 4. TOPICS (checkboxes inside chapters)
create table if not exists public.topics (
  id          text not null,
  user_id     uuid references auth.users on delete cascade not null,
  chapter_id  text not null,
  subject_id  text not null,
  name        text not null,
  done        boolean not null default false,
  sort_order  int  not null default 0,
  primary key (id, user_id)
);

-- 5. CODING LOG (activity entries)
create table if not exists public.coding_log (
  id          text primary key,
  user_id     uuid references auth.users on delete cascade not null,
  date_label  text not null default 'Just Now',
  platform    text not null default 'other',
  description text not null,
  duration    text not null default '30 mins',
  created_at  timestamptz default now()
);

-- 6. TODOS (student task list)
create table if not exists public.todos (
  id          text primary key,
  user_id     uuid references auth.users on delete cascade not null,
  text        text not null,
  status      text not null default 'undone',
  sort_order  int  not null default 0,
  created_at  timestamptz default now()
);

-- 7. WEEKLY HOURS (7-element array Mon–Sun)
create table if not exists public.weekly_hours (
  user_id     uuid references auth.users on delete cascade primary key,
  hours       float[] not null default '{0,0,0,0,0,0,0}'
);

-- 8. INTEGRATIONS (platform connection status)
create table if not exists public.integrations (
  user_id               uuid references auth.users on delete cascade primary key,
  github_connected      boolean not null default false,
  github_username       text    not null default '',
  leetcode_connected    boolean not null default false,
  leetcode_username     text    not null default '',
  codeforces_connected  boolean not null default false,
  codeforces_username   text    not null default ''
);

-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles    enable row level security;
alter table public.subjects    enable row level security;
alter table public.chapters    enable row level security;
alter table public.topics      enable row level security;
alter table public.coding_log  enable row level security;
alter table public.todos       enable row level security;
alter table public.weekly_hours enable row level security;
alter table public.integrations enable row level security;

-- Profiles: users manage their own row
create policy "profiles_self" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Subjects
create policy "subjects_self" on public.subjects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Chapters
create policy "chapters_self" on public.chapters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Topics
create policy "topics_self" on public.topics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Coding Log
create policy "coding_log_self" on public.coding_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Todos
create policy "todos_self" on public.todos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Weekly Hours
create policy "weekly_hours_self" on public.weekly_hours
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Integrations
create policy "integrations_self" on public.integrations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
--  AUTO-CREATE PROFILE ON SIGN UP (trigger)
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', 'https://picsum.photos/seed/student-alex/80/80.jpg')
  )
  on conflict (id) do nothing;

  -- Initialize weekly_hours row for new user
  insert into public.weekly_hours (user_id, hours)
  values (new.id, '{0,0,0,0,0,0,0}')
  on conflict (user_id) do nothing;

  -- Initialize integrations row for new user
  insert into public.integrations (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Drop trigger if already exists, then recreate
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
