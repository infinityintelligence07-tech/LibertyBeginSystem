CREATE OR REPLACE FUNCTION app_private.get_ranking_board_internal()
RETURNS TABLE(id uuid, full_name text, avatar_url text, company_name text, is_ranking_featured boolean, featured_position integer, member_tier text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url, p.company_name,
         COALESCE(p.is_ranking_featured, false), p.featured_position, p.member_tier::text
  FROM public.profiles p
  WHERE p.is_active = true
$$;

CREATE OR REPLACE FUNCTION app_private.get_ranking_totals_internal()
RETURNS TABLE(member_id uuid, points bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT mp.member_id, COALESCE(SUM(mp.points), 0)::bigint
  FROM public.member_points mp
  GROUP BY mp.member_id
$$;

CREATE OR REPLACE FUNCTION app_private.list_tool_members_internal()
RETURNS TABLE(id uuid, full_name text, company_name text, avatar_url text, member_tier public.member_tier)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.company_name, p.avatar_url, p.member_tier
  FROM public.profiles p
  WHERE COALESCE(p.is_active, true) = true
    AND (
      app_private.has_role(auth.uid(), 'admin'::public.app_role)
      OR app_private.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR app_private.has_role(auth.uid(), 'mentor'::public.app_role)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.profile_user_lookup pul
      JOIN public.user_roles ur ON ur.user_id = pul.user_id
      WHERE pul.profile_id = p.id
        AND ur.role = ANY (ARRAY['mentor'::public.app_role,'admin'::public.app_role,'super_admin'::public.app_role])
    )
  ORDER BY p.full_name
$$;

REVOKE ALL ON FUNCTION app_private.get_ranking_board_internal() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.get_ranking_totals_internal() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.list_tool_members_internal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.get_ranking_board_internal() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.get_ranking_totals_internal() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.list_tool_members_internal() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_ranking_board()
RETURNS TABLE(id uuid, full_name text, avatar_url text, company_name text, is_ranking_featured boolean, featured_position integer, member_tier text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT * FROM app_private.get_ranking_board_internal() $$;

CREATE OR REPLACE FUNCTION public.get_ranking_totals()
RETURNS TABLE(member_id uuid, points bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT * FROM app_private.get_ranking_totals_internal() $$;

CREATE OR REPLACE FUNCTION public.list_tool_members()
RETURNS TABLE(id uuid, full_name text, company_name text, avatar_url text, member_tier public.member_tier)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT * FROM app_private.list_tool_members_internal() $$;

REVOKE ALL ON FUNCTION public.get_ranking_board() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ranking_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_tool_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ranking_board() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ranking_totals() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_tool_members() TO authenticated, service_role;