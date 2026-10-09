-- A anotação interna não pode ir na ficha que o mentorado lê.
-- O texto fica só em profile_admin_notes, invisível para quem não é admin ou mentor.

UPDATE public.profiles
SET admin_note = NULL
WHERE admin_note IS NOT NULL;

CREATE OR REPLACE FUNCTION public.keep_profile_admin_note_empty()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.admin_note := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.keep_profile_admin_note_empty() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_keep_profile_admin_note_empty ON public.profiles;
CREATE TRIGGER trg_keep_profile_admin_note_empty
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.keep_profile_admin_note_empty();

DROP POLICY IF EXISTS "Only staff can read member notes" ON public.profile_admin_notes;
CREATE POLICY "Only staff can read member notes"
  ON public.profile_admin_notes
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'mentor')
  );
