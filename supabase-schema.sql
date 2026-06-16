-- Supabase PostgreSQL schema for Smart Grade dashboard

-- 플래너 테이블
create table if not exists planner (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date date not null,
  completed boolean not null default false,
  priority text not null default 'normal',
  created_at timestamptz not null default now()
);

-- 타이머 기록 테이블
create table if not exists timer_records (
  id uuid primary key default gen_random_uuid(),
  record_date date not null,
  focused_minutes integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);

-- 전공 아카이브 테이블
create table if not exists archives (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_path text not null,
  file_url text,
  file_size integer not null,
  created_at timestamptz not null default now()
);

-- 시간표 테이블
create table if not exists timetable (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  weekday text not null,
  period text not null,
  subject text not null,
  created_at timestamptz not null default now()
);

-- 사용자 프로필 테이블
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  role text not null default 'user',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ─── profiles RLS ─────────────────────────────────────────────────────────────
alter table profiles enable row level security;

create policy "Anyone can read profiles"
  on profiles for select
  using (true);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- 플래너 작업 테이블
create table if not exists planner_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  due_date date not null,
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- 시험 일정 테이블
create table if not exists exam_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subject_name text not null,
  exam_type text not null,
  exam_date date not null,
  exam_range text,
  notes text,
  created_at timestamptz not null default now()
);

-- 공부 기록 테이블
create table if not exists study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subject text not null,
  duration_seconds integer not null,
  minutes integer not null,
  date date not null,
  created_at timestamptz not null default now()
);

-- 성적 테이블
create table if not exists grades (
  id uuid primary key default gen_random_uuid(),
  course_name text not null,
  credit integer not null,
  grade_value numeric not null,
  grade_label text not null,
  created_at timestamptz not null default now()
);

-- 학습 전략 테이블
create table if not exists exam_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  exam_type text not null,
  subject_name text not null,
  is_major boolean not null default false,
  credits integer not null,
  study_range text,
  my_score numeric,
  average_score numeric,
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- 아카이브 메타 테이블
create table if not exists academic_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subject_name text not null,
  grade_level text not null,
  semester text not null,
  file_url text,
  file_name text,
  file_type text,
  created_at timestamptz not null default now()
);

-- ─── academic_archive RLS ───────────────────────────────────────────────────
alter table academic_archive enable row level security;

create policy "Users can select own archive"
  on academic_archive for select
  using (auth.uid() = user_id);

create policy "Users can insert own archive"
  on academic_archive for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own archive"
  on academic_archive for delete
  using (auth.uid() = user_id);

-- 커뮤니티 게시판 테이블
create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  author_name text not null,
  category text not null,
  title text not null,
  content text not null,
  file_url text,
  file_name text,
  created_at timestamptz not null default now()
);

-- ─── community_posts RLS ──────────────────────────────────────────────────────
alter table community_posts enable row level security;

create policy "Anyone can read posts"
  on community_posts for select
  using (true);

create policy "Users can insert own posts"
  on community_posts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own posts or admins"
  on community_posts for update
  using (
    auth.uid() = user_id
    or exists (
      select 1 from profiles where id = auth.uid() and role in ('admin', 'staff')
    )
  );

create policy "Users can delete own posts or admins"
  on community_posts for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from profiles where id = auth.uid() and role in ('admin', 'staff')
    )
  );

-- Supabase Storage bucket recommendation:
-- 1. Create a bucket named "archives" in Supabase Storage.
-- 2. Use `uploadArchiveFile('archives', filePath, file)` to upload.
-- 3. Save the returned storage path and URL to the `archives` table.
-- 4. Create a bucket named "study_materials" for archive uploads.
-- 5. Create a bucket named "board_attachments" for community file uploads.
