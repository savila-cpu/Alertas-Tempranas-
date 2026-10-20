-- Ejecutar una vez en Supabase > SQL Editor, en el proyecto de Alertas Tempranas.
-- No elimina ni modifica estados, observaciones, notas o usuarios existentes.
BEGIN;
SET LOCAL lock_timeout = '8s';

CREATE TABLE IF NOT EXISTS public.student_followup_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('initial', 'insert', 'update', 'delete')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_id uuid,
  actor_name text NOT NULL,
  actor_role text,
  before_data jsonb,
  after_data jsonb
);

-- Sin FK hacia student_followups: eliminar el seguimiento actual conserva su historia.
CREATE INDEX IF NOT EXISTS student_followup_history_student_idx
  ON public.student_followup_history (student_key, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS student_followup_history_initial_idx
  ON public.student_followup_history (student_key) WHERE action = 'initial';

ALTER TABLE public.student_followup_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_followup_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.student_followup_history TO authenticated;
REVOKE ALL ON SEQUENCE public.student_followup_history_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_read_followup_history()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin','bienestar','coordinator','viewer')
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_followup_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_followup_history() TO authenticated;

DROP POLICY IF EXISTS "read student followup history" ON public.student_followup_history;
CREATE POLICY "read student followup history"
  ON public.student_followup_history FOR SELECT TO authenticated
  USING ((SELECT public.can_read_followup_history()));
-- No se conceden INSERT, UPDATE o DELETE a los usuarios de la aplicacion.

CREATE OR REPLACE FUNCTION public.audit_student_followup_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_before jsonb;
  v_after jsonb;
  v_actor uuid := auth.uid();
  v_name text;
  v_role text;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'student_followups' THEN
    RAISE EXCEPTION 'Trigger reservado para student_followups';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.student_key IS DISTINCT FROM OLD.student_key THEN
    RAISE EXCEPTION 'No se puede cambiar la identificacion de un seguimiento existente';
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    v_before := jsonb_build_object('estado', OLD.estado, 'observaciones', OLD.observaciones,
      'updated_at', OLD.updated_at, 'updated_by', OLD.updated_by);
    v_key := OLD.student_key;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_after := jsonb_build_object('estado', NEW.estado, 'observaciones', NEW.observaciones,
      'updated_at', NEW.updated_at, 'updated_by', NEW.updated_by);
    v_key := NEW.student_key;
  END IF;
  IF v_actor IS NOT NULL THEN
    SELECT NULLIF(btrim(p.full_name), ''), p.role INTO v_name, v_role
      FROM public.profiles p WHERE p.id = v_actor;
  END IF;
  v_name := coalesce(v_name, CASE WHEN v_actor IS NULL
    THEN 'Operacion administrativa (sin sesion de la aplicacion)'
    ELSE 'Usuario institucional' END);

  -- Identidad y hora capturadas en servidor; no se atribuye un DELETE al editor anterior.
  INSERT INTO public.student_followup_history
    (student_key, action, actor_id, actor_name, actor_role, before_data, after_data)
  VALUES (v_key, lower(TG_OP), v_actor, v_name, v_role, v_before, v_after);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_student_followup_history() FROM PUBLIC, anon, authenticated;

-- Bloquea escrituras brevemente para instalar el historial sin perder interacciones.
LOCK TABLE public.student_followups IN SHARE ROW EXCLUSIVE MODE;
DROP TRIGGER IF EXISTS record_student_followup_history ON public.student_followups;
CREATE TRIGGER record_student_followup_history
  AFTER INSERT OR UPDATE OR DELETE ON public.student_followups
  FOR EACH ROW EXECUTE FUNCTION public.audit_student_followup_history();

-- Respaldo inicial honesto: conserva solo el ultimo estado disponible, no inventa eventos pasados.
INSERT INTO public.student_followup_history
  (student_key, action, actor_id, actor_name, actor_role, before_data, after_data)
SELECT f.student_key, 'initial', NULL, 'Estado existente al activar el historial', NULL, NULL,
  jsonb_build_object('estado', f.estado, 'observaciones', f.observaciones,
    'updated_at', f.updated_at, 'updated_by', f.updated_by)
FROM public.student_followups f
WHERE NOT EXISTS (
  SELECT 1 FROM public.student_followup_history h WHERE h.student_key = f.student_key
);

COMMENT ON TABLE public.student_followup_history IS
  'Historial de gestiones guardadas: registro inicial, creacion, actualizacion y eliminacion. No registra visitas o clics.';
NOTIFY pgrst, 'reload schema';
COMMIT;
