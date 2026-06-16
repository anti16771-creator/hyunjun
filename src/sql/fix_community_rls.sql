-- ── community_posts RLS 정책 수정 ────────────────────────────────────────────
-- Supabase SQL Editor에서 위에서부터 순서대로 전체 실행하세요.
--
-- community_posts 테이블 컬럼 확인:
--   user_id  uuid not null  ← 작성자 auth.uid() 저장 컬럼
--   profiles 테이블만 사용 (user_profiles 테이블 없음)

-- ── 1. 기존 정책 제거 ─────────────────────────────────────────────────────────
drop policy if exists "Users can update own posts or admins" on community_posts;
drop policy if exists "Users can delete own posts or admins" on community_posts;

-- ── 2. UPDATE 정책: 작성자 본인 OR profiles 테이블 관리자/스태프 ──────────────
create policy "Users can update own posts or admins"
  on community_posts for update
  using (
    auth.uid() = user_id
    or exists (
      select 1 from profiles where id = auth.uid() and role in ('admin', 'staff')
    )
  );

-- ── 3. DELETE 정책: 작성자 본인 OR profiles 테이블 관리자/스태프 ──────────────
create policy "Users can delete own posts or admins"
  on community_posts for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from profiles where id = auth.uid() and role in ('admin', 'staff')
    )
  );

-- ── 4. [진단] 현재 적용된 RLS 정책 목록 확인 ─────────────────────────────────
-- 아래 쿼리를 따로 실행해서 정책이 올바르게 등록됐는지 확인하세요.
-- select policyname, cmd, qual
-- from pg_policies
-- where tablename = 'community_posts'
-- order by cmd;

-- ── 5. [진단] 현재 로그인 사용자 uid 확인 ────────────────────────────────────
-- select auth.uid();

-- ── 6. [진단] 내 게시글의 user_id와 auth.uid() 일치 여부 확인 ────────────────
-- select id, user_id, auth.uid(), (user_id = auth.uid()) as is_mine
-- from community_posts
-- order by created_at desc
-- limit 10;
