-- [REDACTED] A redefinicao de senha (encrypted_password = crypt('<senha>', gen_salt('bf')))
-- foi removida desta migration por seguranca. Ja foi aplicada em producao.
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE id = '10d55170-1a53-4698-9512-325f3f82cc59';

DELETE FROM public.user_roles
WHERE user_id = '10d55170-1a53-4698-9512-325f3f82cc59'
  AND role = 'liberty';
