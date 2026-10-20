-- Ejecutar una vez en Supabase > SQL Editor.
-- Requiere student_followups y can_edit_followups() ya existentes.
-- Permite eliminar seguimientos a los mismos roles que pueden editarlos:
-- admin, bienestar y coordinator. Consulta no obtiene permiso.
-- Este script no elimina filas ni modifica las notas de Google Sheets.

BEGIN;

ALTER TABLE public.student_followups ENABLE ROW LEVEL SECURITY;

GRANT DELETE ON TABLE public.student_followups TO authenticated;

DROP POLICY IF EXISTS "delete student followups"
ON public.student_followups;

CREATE POLICY "delete student followups"
ON public.student_followups
FOR DELETE
TO authenticated
USING ((SELECT public.can_edit_followups()));

COMMIT;
