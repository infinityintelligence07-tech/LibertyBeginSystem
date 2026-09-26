-- O membro não consegue ler `profiles` de outra pessoa, então a próxima sessão
-- aparecia como "com Mentor" mesmo com mentor definido no agendamento.
-- Esta função devolve só id e nome, e só de quem tem papel de mentor.

CREATE OR REPLACE FUNCTION public.mentor_display_names(_ids uuid[])
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  WHERE p.id = ANY(_ids)
    AND app_private.profile_has_role(p.id, 'mentor'::public.app_role);
$$;

REVOKE ALL ON FUNCTION public.mentor_display_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mentor_display_names(uuid[]) TO authenticated;
