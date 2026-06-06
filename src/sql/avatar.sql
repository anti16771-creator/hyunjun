-- ── profiles 테이블에 avatar_url 컬럼 추가 ──────────────────────────────────
-- (user_profiles 테이블이 있으면 동일하게 실행)
ALTER TABLE public.profiles      ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ── Storage: avatars 버킷은 Supabase 대시보드 > Storage에서 직접 생성 ────────
-- (public 버킷으로 생성, 이름: avatars)

-- ── Storage RLS 정책 ────────────────────────────────────────────────────────
CREATE POLICY "Avatars are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
