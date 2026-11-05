-- Ejecutar una vez en Supabase > SQL Editor para habilitar perfiles docentes.
BEGIN;

CREATE TABLE IF NOT EXISTS public.teacher_profiles (
  teacher_key text PRIMARY KEY,
  full_name text NOT NULL,
  identification text,
  institutional_email text,
  phone text,
  profession text,
  education_level text,
  employment_type text,
  dedication text,
  program_coordination text,
  status text NOT NULL DEFAULT 'Activo' CHECK (status IN ('Activo','Inactivo')),
  photo_path text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.teacher_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_teacher_profiles()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin','coordinator')
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_teacher_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_teacher_profiles() TO authenticated;

DROP POLICY IF EXISTS "read teacher profiles" ON public.teacher_profiles;
CREATE POLICY "read teacher profiles"
ON public.teacher_profiles
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "insert teacher profiles" ON public.teacher_profiles;
CREATE POLICY "insert teacher profiles"
ON public.teacher_profiles
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.can_manage_teacher_profiles()));

DROP POLICY IF EXISTS "update teacher profiles" ON public.teacher_profiles;
CREATE POLICY "update teacher profiles"
ON public.teacher_profiles
FOR UPDATE
TO authenticated
USING ((SELECT public.can_manage_teacher_profiles()))
WITH CHECK ((SELECT public.can_manage_teacher_profiles()));

INSERT INTO storage.buckets (id, name, public)
VALUES ('teacher-photos','teacher-photos',false)
ON CONFLICT (id) DO UPDATE SET public=false;

DROP POLICY IF EXISTS "read teacher photos" ON storage.objects;
CREATE POLICY "read teacher photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'teacher-photos');

DROP POLICY IF EXISTS "upload teacher photos" ON storage.objects;
CREATE POLICY "upload teacher photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'teacher-photos'
  AND (SELECT public.can_manage_teacher_profiles())
);

DROP POLICY IF EXISTS "update teacher photos" ON storage.objects;
CREATE POLICY "update teacher photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'teacher-photos'
  AND (SELECT public.can_manage_teacher_profiles())
)
WITH CHECK (
  bucket_id = 'teacher-photos'
  AND (SELECT public.can_manage_teacher_profiles())
);

DROP POLICY IF EXISTS "delete teacher photos" ON storage.objects;
CREATE POLICY "delete teacher photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'teacher-photos'
  AND (SELECT public.can_manage_teacher_profiles())
);

NOTIFY pgrst, 'reload schema';
COMMIT;
