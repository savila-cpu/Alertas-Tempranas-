-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Estructura independiente para seguimiento de programas ETDH (Técnicos Laborales).
BEGIN;

CREATE TABLE IF NOT EXISTS public.etdh_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document text NOT NULL,
  full_name text NOT NULL,
  program text NOT NULL,
  status text NOT NULL DEFAULT 'Activo' CHECK (status IN ('Activo','Inactivo','Retirado','Finalizado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document, program)
);

CREATE TABLE IF NOT EXISTS public.etdh_module_grades (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.etdh_students(id) ON DELETE CASCADE,
  module_number integer NOT NULL CHECK (module_number > 0),
  module_name text,
  aplicativo numeric,
  formativo numeric,
  cognitivo numeric,
  observations text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, module_number)
);

CREATE INDEX IF NOT EXISTS etdh_students_program_idx
  ON public.etdh_students(program);

CREATE INDEX IF NOT EXISTS etdh_module_grades_module_idx
  ON public.etdh_module_grades(module_number);

ALTER TABLE public.etdh_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etdh_module_grades ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.etdh_students TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etdh_module_grades TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_etdh()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin','coordinator','bienestar','viewer')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_etdh()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin','coordinator')
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_etdh() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_etdh() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_etdh() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_etdh() TO authenticated;

DROP POLICY IF EXISTS "read etdh students" ON public.etdh_students;
CREATE POLICY "read etdh students"
ON public.etdh_students FOR SELECT TO authenticated
USING ((SELECT public.can_read_etdh()));

DROP POLICY IF EXISTS "manage etdh students insert" ON public.etdh_students;
CREATE POLICY "manage etdh students insert"
ON public.etdh_students FOR INSERT TO authenticated
WITH CHECK ((SELECT public.can_manage_etdh()));

DROP POLICY IF EXISTS "manage etdh students update" ON public.etdh_students;
CREATE POLICY "manage etdh students update"
ON public.etdh_students FOR UPDATE TO authenticated
USING ((SELECT public.can_manage_etdh()))
WITH CHECK ((SELECT public.can_manage_etdh()));

DROP POLICY IF EXISTS "manage etdh students delete" ON public.etdh_students;
CREATE POLICY "manage etdh students delete"
ON public.etdh_students FOR DELETE TO authenticated
USING ((SELECT public.can_manage_etdh()));

DROP POLICY IF EXISTS "read etdh grades" ON public.etdh_module_grades;
CREATE POLICY "read etdh grades"
ON public.etdh_module_grades FOR SELECT TO authenticated
USING ((SELECT public.can_read_etdh()));

DROP POLICY IF EXISTS "manage etdh grades insert" ON public.etdh_module_grades;
CREATE POLICY "manage etdh grades insert"
ON public.etdh_module_grades FOR INSERT TO authenticated
WITH CHECK ((SELECT public.can_manage_etdh()));

DROP POLICY IF EXISTS "manage etdh grades update" ON public.etdh_module_grades;
CREATE POLICY "manage etdh grades update"
ON public.etdh_module_grades FOR UPDATE TO authenticated
USING ((SELECT public.can_manage_etdh()))
WITH CHECK ((SELECT public.can_manage_etdh()));

DROP POLICY IF EXISTS "manage etdh grades delete" ON public.etdh_module_grades;
CREATE POLICY "manage etdh grades delete"
ON public.etdh_module_grades FOR DELETE TO authenticated
USING ((SELECT public.can_manage_etdh()));

NOTIFY pgrst, 'reload schema';
COMMIT;
