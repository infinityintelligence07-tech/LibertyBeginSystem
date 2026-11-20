-- Ferramenta Brand Book: quadro de branding preenchido na sessão "Branding Book".
-- Reaproveita tool_templates / tool_applications. Acrescenta:
--   share_token  link público de leitura (sem plano de ação e sem prompt de IA)
--   booking_id   sessão em que o quadro foi construído

ALTER TABLE public.tool_applications
  ADD COLUMN IF NOT EXISTS share_token uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.tool_applications
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tool_applications_share_token_idx
  ON public.tool_applications (share_token);

INSERT INTO public.tool_templates (slug, name, description, icon, result_type, sort_order, is_active)
VALUES (
  'brand-book',
  'Brand Book',
  'Quadro de branding da sessão: o que a marca transmite, história, promessa, arquétipos, paleta, crenças e experiência do cliente.',
  'palette',
  'board',
  2,
  true
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      icon = EXCLUDED.icon,
      result_type = EXCLUDED.result_type,
      is_active = true;

-- Leitura pública pelo token. Não devolve o plano de ação.
CREATE OR REPLACE FUNCTION public.get_shared_brand_book(_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', a.id,
    'answers', a.answers - 'plano',
    'status', a.status,
    'updated_at', a.updated_at,
    'member_first_name', split_part(coalesce(p.full_name, ''), ' ', 1),
    'company_name', p.company_name
  )
  FROM public.tool_applications a
  JOIN public.tool_templates t ON t.id = a.template_id
  LEFT JOIN public.profiles p ON p.id = a.member_id
  WHERE a.share_token = _token
    AND t.slug = 'brand-book'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_shared_brand_book(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_brand_book(uuid) TO anon, authenticated;

-- Conclui o Brand Book e avisa o aluno (mentor não tem INSERT em notifications).
CREATE OR REPLACE FUNCTION public.complete_brand_book(_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _member_user uuid;
  _was_completed boolean;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'mentor')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para concluir o Brand Book';
  END IF;

  SELECT p.user_id, a.status = 'completed'
    INTO _member_user, _was_completed
  FROM public.tool_applications a
  JOIN public.tool_templates t ON t.id = a.template_id
  JOIN public.profiles p ON p.id = a.member_id
  WHERE a.id = _application_id AND t.slug = 'brand-book';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brand Book não encontrado';
  END IF;

  UPDATE public.tool_applications
     SET status = 'completed',
         completed_at = coalesce(completed_at, now())
   WHERE id = _application_id;

  IF _member_user IS NOT NULL AND NOT coalesce(_was_completed, false) THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      _member_user,
      'tool_shared',
      'Seu Brand Book está pronto',
      'O quadro de branding da sua sessão já está na sua área de ferramentas.',
      '/ferramentas/brand-book/' || _application_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_brand_book(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_brand_book(uuid) TO authenticated;
