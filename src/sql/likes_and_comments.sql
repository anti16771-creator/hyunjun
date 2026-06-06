-- ── post_likes ──────────────────────────────────────────────────────────────
create table if not exists public.post_likes (
  id         uuid        default gen_random_uuid() primary key,
  post_id    uuid        not null references public.community_posts(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)             on delete cascade,
  created_at timestamptz default now(),
  unique (post_id, user_id)
);

alter table public.post_likes enable row level security;

create policy "post_likes: anyone can read"
  on public.post_likes for select using (true);

create policy "post_likes: authenticated users can insert own"
  on public.post_likes for insert
  with check (auth.uid() = user_id);

create policy "post_likes: authenticated users can delete own"
  on public.post_likes for delete
  using (auth.uid() = user_id);

-- ── comments ─────────────────────────────────────────────────────────────────
create table if not exists public.comments (
  id          uuid        default gen_random_uuid() primary key,
  post_id     uuid        not null references public.community_posts(id) on delete cascade,
  user_id     uuid        not null references auth.users(id)             on delete cascade,
  author_name text        not null,
  content     text        not null,
  created_at  timestamptz default now()
);

alter table public.comments enable row level security;

create policy "comments: anyone can read"
  on public.comments for select using (true);

create policy "comments: authenticated users can insert own"
  on public.comments for insert
  with check (auth.uid() = user_id);

create policy "comments: authenticated users can delete own"
  on public.comments for delete
  using (auth.uid() = user_id);
