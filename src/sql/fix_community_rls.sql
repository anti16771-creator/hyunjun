-- community_posts RLS 정책 수정
-- profiles 또는 user_profiles 중 어느 테이블이 사용되든 작동하도록 수정
-- Supabase SQL Editor에서 실행하세요

-- 기존 정책 제거
drop policy if exists "Users can update own posts or admins" on community_posts;
drop policy if exists "Users can delete own posts or admins" on community_posts;

-- 수정된 UPDATE 정책: 작성자 본인 OR 관리자 (profiles/user_profiles 양쪽 확인)
create policy "Users can update own posts or admins"
  on community_posts for update
  using (
    auth.uid() = user_id
    or exists (
      select 1 from user_profiles where id = auth.uid() and role in ('admin', 'staff')
    )
    or exists (
      select 1 from profiles where id = auth.uid() and role in ('admin', 'staff')
    )
  );

-- 수정된 DELETE 정책: 작성자 본인 OR 관리자 (profiles/user_profiles 양쪽 확인)
create policy "Users can delete own posts or admins"
  on community_posts for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from user_profiles where id = auth.uid() and role in ('admin', 'staff')
    )
    or exists (
      select 1 from profiles where id = auth.uid() and role in ('admin', 'staff')
    )
  );

-- [진단용] 현재 RLS 정책 목록 확인
-- select policyname, cmd, qual from pg_policies where tablename = 'community_posts';

-- [진단용] 특정 사용자로 RLS 테스트 (auth.uid() 반환 확인)
-- select auth.uid();
