-- Histórico de anotações da coordenação. Cada nota fica, com autor e data.
-- A coluna profiles.admin_note continua com o texto da nota mais recente.

CREATE TABLE IF NOT EXISTS public.profile_admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  author_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_admin_notes_body_not_blank CHECK (btrim(body) <> '')
);

CREATE INDEX IF NOT EXISTS profile_admin_notes_profile_created_idx
  ON public.profile_admin_notes (profile_id, created_at DESC);

ALTER TABLE public.profile_admin_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage member notes" ON public.profile_admin_notes;
CREATE POLICY "Admins manage member notes"
  ON public.profile_admin_notes
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Mentors can read member notes" ON public.profile_admin_notes;
CREATE POLICY "Mentors can read member notes"
  ON public.profile_admin_notes
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'mentor'));

INSERT INTO public.profile_admin_notes (profile_id, body, created_at)
SELECT p.id, btrim(p.admin_note), COALESCE(p.updated_at, now())
FROM public.profiles p
WHERE p.admin_note IS NOT NULL
  AND btrim(p.admin_note) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_admin_notes n WHERE n.profile_id = p.id
  );
