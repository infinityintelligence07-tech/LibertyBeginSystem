
-- 1) Move google_refresh_token to a private table
CREATE TABLE IF NOT EXISTS public.user_oauth_tokens (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_refresh_token text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.user_oauth_tokens TO service_role;
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated => not accessible via Data API.

INSERT INTO public.user_oauth_tokens (profile_id, google_refresh_token)
SELECT id, google_refresh_token FROM public.profiles WHERE google_refresh_token IS NOT NULL
ON CONFLICT (profile_id) DO NOTHING;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_connected boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET google_connected = (google_refresh_token IS NOT NULL);
ALTER TABLE public.profiles DROP COLUMN google_refresh_token;

-- 2) Bookings: scope mentor write to their own assignments
DROP POLICY IF EXISTS "Mentors can insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "Mentors can update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Mentors can delete bookings" ON public.bookings;

CREATE POLICY "Mentors can insert own bookings" ON public.bookings
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'mentor')
  AND mentor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Mentors can update own bookings" ON public.bookings
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor')
  AND mentor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
)
WITH CHECK (
  mentor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Mentors can delete own bookings" ON public.bookings
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor')
  AND mentor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- 3) Profiles: scope mentor SELECT to assigned students; drop broad mentor UPDATE
DROP POLICY IF EXISTS "Mentors can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Mentors can update profiles" ON public.profiles;

CREATE POLICY "Mentors can view related profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor')
  AND (
    user_id = auth.uid()
    OR id IN (
      SELECT b.liberty_id FROM public.bookings b
      WHERE b.mentor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    OR id IN (
      SELECT b.mentor_id FROM public.bookings b
      WHERE b.liberty_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  )
);

-- 4) user_roles: own-only SELECT
DROP POLICY IF EXISTS "Anyone authenticated can view roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 5) Storage: drop broad SELECT on public buckets (CDN URLs still work)
DROP POLICY IF EXISTS "Avatars publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Session covers publicly readable" ON storage.objects;

-- 6) Lock down SECURITY DEFINER / internal functions
-- has_role: switch to SECURITY INVOKER (works because user_roles RLS now allows self-read)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR (_role = 'admin' AND role = 'super_admin'))
  )
$$;

REVOKE EXECUTE ON FUNCTION public._notif_user_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_booking_changes() FROM PUBLIC, anon, authenticated;
