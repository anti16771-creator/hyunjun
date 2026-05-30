-- Supabase Auth 연동 user_profiles 테이블 생성 및 트리거

-- 1) 사용자 프로필 테이블 생성
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) auth.users INSERT 시 public.user_profiles를 자동 생성하는 트리거 함수
CREATE OR REPLACE FUNCTION public.handle_user_profile_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_profiles (id, email, name, role, created_at)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', ''),
      'user',
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) auth.users INSERT에 트리거 연결
DROP TRIGGER IF EXISTS create_user_profile ON auth.users;
CREATE TRIGGER create_user_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE public.handle_user_profile_insert();
