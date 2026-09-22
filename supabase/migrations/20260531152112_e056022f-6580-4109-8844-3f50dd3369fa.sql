INSERT INTO storage.buckets (id, name, public)
VALUES ('session-covers', 'session-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Session covers publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'session-covers');

CREATE POLICY "Admins manage session covers"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'session-covers' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'session-covers' AND public.has_role(auth.uid(), 'admin'::app_role));