
-- Confirm the user's email
UPDATE auth.users SET email_confirmed_at = now() WHERE email = 'libertybegin@gmail.com' AND email_confirmed_at IS NULL;

-- Assign admin role
INSERT INTO public.user_roles (user_id, role)
VALUES ('40cdbd80-bfe7-42c8-b1ea-dd446299f768', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
