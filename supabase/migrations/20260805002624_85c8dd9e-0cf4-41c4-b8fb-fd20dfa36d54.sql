CREATE OR REPLACE FUNCTION public.get_ranking_board()
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  company_name text,
  is_ranking_featured boolean,
  featured_position integer,
  member_tier text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url, p.company_name,
         COALESCE(p.is_ranking_featured, false), p.featured_position, p.member_tier::text
  FROM public.profiles p
  WHERE p.is_active = true
$$;

REVOKE ALL ON FUNCTION public.get_ranking_board() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ranking_board() TO authenticated;