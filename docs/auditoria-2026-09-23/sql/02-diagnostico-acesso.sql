-- 02 · DIAGNÓSTICO (somente leitura) · acesso de Emerson e Rogério
-- Cruza perfil (painel) x conta de login (auth) x papel. Nada é alterado.
SELECT
  COALESCE(p.full_name, u.raw_user_meta_data->>'full_name') AS nome,
  p.email                       AS email_no_perfil,
  u.email                       AS email_na_conta_login,
  p.member_tier                 AS plano,
  p.is_active                   AS perfil_ativo,
  u.email_confirmed_at          AS email_confirmado_em,
  u.banned_until                AS bloqueado_ate,
  u.last_sign_in_at             AS ultimo_login,
  u.recovery_sent_at            AS ultimo_email_recuperacao,
  (SELECT string_agg(r.role::text, ',') FROM public.user_roles r
    WHERE r.user_id = COALESCE(p.user_id, u.id))                AS papeis,
  CASE
    WHEN p.id IS NULL                       THEN 'AUTH SEM PROFILE'
    WHEN u.id IS NULL                       THEN 'PROFILE SEM AUTH (sem conta de login: use "Gerar acesso" no painel)'
    WHEN p.user_id IS NULL                  THEN 'AUTH EXISTE MAS PROFILE NÃO VINCULADO (rode o 06)'
    WHEN p.user_id <> u.id                  THEN 'PROFILE VINCULADO A OUTRO AUTH (me envie o print)'
    WHEN lower(trim(p.email)) <> lower(u.email) THEN 'E-MAIL DO PERFIL DIFERENTE DO E-MAIL DE LOGIN (me envie o print)'
    WHEN u.banned_until IS NOT NULL AND u.banned_until > now() THEN 'CONTA BLOQUEADA'
    WHEN NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id) THEN 'SEM PAPEL (trava no login)'
    ELSE 'OK (senha errada: use "Gerar acesso")'
  END                           AS situacao,
  p.id                          AS profile_id,
  u.id                          AS auth_user_id
FROM public.profiles p
FULL JOIN auth.users u
  ON u.id = p.user_id OR lower(u.email) = lower(trim(p.email))
WHERE p.full_name ~* '(emerson|rog[eé]rio)'
   OR p.email     ~* '(emerson|rogerio)'
   OR u.email     ~* '(emerson|rogerio)'
   OR (u.raw_user_meta_data->>'full_name') ~* '(emerson|rog[eé]rio)'
ORDER BY nome;
