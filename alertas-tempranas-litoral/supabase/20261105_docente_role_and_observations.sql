-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Habilita el rol docente, vincula cada usuario con el nombre usado en la hoja
-- y crea observaciones docentes separadas del seguimiento de Bienestar.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teacher_name text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('viewer','docente','bienestar','coordinator','admin'));

CREATE TABLE IF NOT EXISTS public.teacher_student_observations (
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_key text NOT NULL,
  observations text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, student_key)
);

ALTER TABLE public.teacher_student_observations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.teacher_student_observations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.teacher_student_observations TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_teacher_observations()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin','bienestar','coordinator')
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_teacher_observations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_teacher_observations() TO authenticated;

DROP POLICY IF EXISTS "teachers read own observations" ON public.teacher_student_observations;
CREATE POLICY "teachers read own observations"
ON public.teacher_student_observations
FOR SELECT
TO authenticated
USING (
  teacher_id = (SELECT auth.uid())
  OR (SELECT public.can_read_teacher_observations())
);

DROP POLICY IF EXISTS "teachers insert own observations" ON public.teacher_student_observations;
CREATE POLICY "teachers insert own observations"
ON public.teacher_student_observations
FOR INSERT
TO authenticated
WITH CHECK (
  teacher_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role = 'docente'
  )
);

DROP POLICY IF EXISTS "teachers update own observations" ON public.teacher_student_observations;
CREATE POLICY "teachers update own observations"
ON public.teacher_student_observations
FOR UPDATE
TO authenticated
USING (
  teacher_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role = 'docente'
  )
)
WITH CHECK (
  teacher_id = (SELECT auth.uid())
);

CREATE INDEX IF NOT EXISTS teacher_student_observations_student_idx
  ON public.teacher_student_observations(student_key);

-- Permitir que el rol docente consulte el historial de seguimiento existente.
CREATE OR REPLACE FUNCTION public.can_read_followup_history()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin','bienestar','coordinator','viewer','docente')
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_followup_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_followup_history() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
