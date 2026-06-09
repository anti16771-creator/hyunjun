-- Migration: add type column to post_likes for dislike support
alter table public.post_likes
  add column if not exists type text not null default 'like'
  constraint post_likes_type_check check (type in ('like', 'dislike'));
