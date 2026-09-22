-- Create avatars bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Avatars publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Admins can do anything in avatars bucket
CREATE POLICY "Admins manage avatars"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'admin'::app_role));

-- Users manage their own avatar (folder = their user_id)
CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);