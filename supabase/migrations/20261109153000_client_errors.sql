-- Erros que derrubam a tela no navegador do usuário, para a equipe ver a causa exata.

CREATE TABLE IF NOT EXISTS public.client_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  path text,
  message text,
  stack text,
  component_stack text,
  user_agent text,
  build text
);

CREATE INDEX IF NOT EXISTS client_errors_created_idx ON public.client_errors (created_at DESC);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.client_errors TO anon, authenticated;
GRANT SELECT ON public.client_errors TO authenticated;

DROP POLICY IF EXISTS "Anyone can report client errors" ON public.client_errors;
CREATE POLICY "Anyone can report client errors"
  ON public.client_errors
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND length(COALESCE(message, '')) <= 2000
    AND length(COALESCE(stack, '')) <= 8000
    AND length(COALESCE(component_stack, '')) <= 8000
    AND length(COALESCE(path, '')) <= 500
    AND length(COALESCE(user_agent, '')) <= 500
    AND length(COALESCE(build, '')) <= 200
  );

DROP POLICY IF EXISTS "Admins read client errors" ON public.client_errors;
CREATE POLICY "Admins read client errors"
  ON public.client_errors
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
