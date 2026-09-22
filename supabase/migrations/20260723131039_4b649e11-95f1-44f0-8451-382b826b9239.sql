
-- Tighten SELECT on member_points: only owner, mentors, admins.
DROP POLICY IF EXISTS "authenticated read member_points" ON public.member_points;
DROP POLICY IF EXISTS "read own member_points" ON public.member_points;
DROP POLICY IF EXISTS "member_points_select" ON public.member_points;

CREATE POLICY "member_points_select_owner_or_staff"
ON public.member_points
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'mentor')
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = member_points.member_id
      AND p.user_id = auth.uid()
  )
);

-- Aggregated totals for the public ranking (no reasons, no related IDs).
CREATE OR REPLACE FUNCTION public.get_ranking_totals()
RETURNS TABLE(member_id uuid, points bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT member_id, COALESCE(SUM(points), 0)::bigint AS points
  FROM public.member_points
  GROUP BY member_id;
$$;

REVOKE ALL ON FUNCTION public.get_ranking_totals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ranking_totals() TO authenticated;
