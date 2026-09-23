-- 06 · CORREÇÃO · Emerson e Rogério
-- Use SOMENTE se o 02-diagnostico-acesso.sql mostrou "AUTH EXISTE MAS PROFILE NÃO VINCULADO".
-- Vincula o perfil do painel à conta de login com o mesmo e-mail e garante o papel "liberty".
-- Não cria conta de login: se a situação for "PROFILE SEM AUTH", use "Gerar acesso" no painel.
DO $$
DECLARE
  r record;
  v_n int := 0;
BEGIN
  FOR r IN
    SELECT p.id AS profile_id, p.full_name, u.id AS auth_user_id, u.email
    FROM public.profiles p
    JOIN auth.users u ON lower(u.email) = lower(trim(p.email))
    WHERE p.user_id IS NULL
      AND (p.full_name ~* '(emerson|rog[eé]rio)' OR p.email ~* '(emerson|rogerio)')
      -- garante que essa conta de login não está presa a outro perfil
      AND NOT EXISTS (SELECT 1 FROM public.profiles x WHERE x.user_id = u.id)
  LOOP
    UPDATE public.profiles
       SET user_id = r.auth_user_id,
           email   = lower(trim(email)),
           updated_at = now()
     WHERE id = r.profile_id;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (r.auth_user_id, 'liberty')
    ON CONFLICT DO NOTHING;

    v_n := v_n + 1;
    RAISE NOTICE 'Vinculado: % (%) -> conta %', r.full_name, r.email, r.auth_user_id;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Nenhum perfil de Emerson/Rogério sem vínculo com conta de login existente foi encontrado. Se o diagnóstico mostrou "PROFILE SEM AUTH", use "Gerar acesso" no painel.';
  END IF;
END $$;

-- Conferência (repete o diagnóstico)
SELECT p.full_name, p.email, p.user_id IS NOT NULL AS tem_conta_login,
       (SELECT string_agg(r.role::text, ',') FROM public.user_roles r WHERE r.user_id = p.user_id) AS papeis
FROM public.profiles p
WHERE p.full_name ~* '(emerson|rog[eé]rio)' OR p.email ~* '(emerson|rogerio)';
