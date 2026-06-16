-- ── 프로필 이미지 저장 수정 SQL ───────────────────────────────────────────────
-- Supabase SQL Editor에서 순서대로 실행하세요.

-- ── 1. avatar_url 컬럼 추가 (없으면) ────────────────────────────────────────
ALTER TABLE public.profiles      ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ── 2. avatars 버킷 생성 (public, 없으면 삽입) ───────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ── 3. Storage RLS 정책 (기존 정책 제거 후 재생성) ──────────────────────────
DROP POLICY IF EXISTS "Avatars are publicly viewable"  ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar"    ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar"    ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar"    ON storage.objects;

-- 공개 읽기
CREATE POLICY "Avatars are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- 본인 폴더에만 업로드 허용 (경로: {user_id}/avatar.{ext})
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- 본인 폴더 파일만 수정 허용
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- 본인 폴더 파일만 삭제 허용
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── 4. profiles 테이블 RLS — UPDATE 정책 확인/추가 ──────────────────────────
-- profiles 테이블에 UPDATE 정책이 없으면 avatar_url 저장이 차단됩니다.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- user_profiles 테이블도 동일하게
DROP POLICY IF EXISTS "Users can update own user_profile" ON public.user_profiles;
CREATE POLICY "Users can update own user_profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── 5. [진단용] 현재 정책 목록 확인 ────────────────────────────────────────
-- SELECT policyname, tablename, cmd FROM pg_policies
-- WHERE tablename IN ('profiles', 'user_profiles', 'objects')
-- ORDER BY tablename, cmd;

-- ── 6. [진단용] avatar_url 컬럼 존재 여부 확인 ──────────────────────────────
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE table_name IN ('profiles', 'user_profiles') AND column_name = 'avatar_url';
