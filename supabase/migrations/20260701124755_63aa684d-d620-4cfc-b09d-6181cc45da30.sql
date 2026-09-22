REVOKE ALL ON public.user_oauth_tokens FROM anon;
REVOKE ALL ON public.user_oauth_tokens FROM authenticated;
GRANT ALL ON public.user_oauth_tokens TO service_role;

DROP POLICY IF EXISTS "No direct user access to oauth tokens" ON public.user_oauth_tokens;
CREATE POLICY "No direct user access to oauth tokens"
ON public.user_oauth_tokens
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);