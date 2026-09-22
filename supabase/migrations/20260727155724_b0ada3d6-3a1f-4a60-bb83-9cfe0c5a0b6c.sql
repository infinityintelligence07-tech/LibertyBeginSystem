CREATE POLICY "Super admins can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (app_private.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (app_private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.list_tool_members()
RETURNS TABLE(id uuid, full_name text, company_name text, avatar_url text, member_tier public.member_tier)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.company_name, p.avatar_url, p.member_tier
  FROM public.profiles p
  WHERE COALESCE(p.is_active, true) = true
    AND (
      app_private.has_role(auth.uid(), 'admin'::app_role)
      OR app_private.has_role(auth.uid(), 'super_admin'::app_role)
      OR app_private.has_role(auth.uid(), 'mentor'::app_role)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.profile_user_lookup pul
      JOIN public.user_roles ur ON ur.user_id = pul.user_id
      WHERE pul.profile_id = p.id
        AND ur.role = ANY (ARRAY['mentor'::app_role,'admin'::app_role,'super_admin'::app_role])
    )
  ORDER BY p.full_name;
$$;

REVOKE ALL ON FUNCTION public.list_tool_members() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_tool_members() TO authenticated;