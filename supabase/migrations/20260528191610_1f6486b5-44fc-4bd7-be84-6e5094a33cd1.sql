-- [REDACTED] Esta migration originalmente redefinia a senha de um usuario via
-- UPDATE auth.users SET encrypted_password = crypt('<senha>', gen_salt('bf')).
-- A senha em texto claro foi removida do repositorio por seguranca.
-- A alteracao ja foi aplicada no banco de producao; redefinicoes de senha devem
-- ser feitas pelo dashboard do Supabase ou pela Admin API, nunca em migrations.
SELECT 1;
