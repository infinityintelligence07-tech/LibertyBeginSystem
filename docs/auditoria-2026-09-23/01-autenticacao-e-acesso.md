# Auditoria — Autenticação / Acessos (Liberty Begin)

Nenhum arquivo foi editado. Linhas citadas são as reais dos arquivos lidos.

---

## 1. Bug de login (Emerson/Rogério)

### Avaliação das hipóteses

| Hip. | Descrição | Veredito |
|---|---|---|
| (a) | Case/trim divergente login × cadastro | **Refutada como causa do login**: `useAuth.tsx:135` normaliza e o GoTrue também normaliza internamente. **Confirmada como inconsistência de dados**: `AdminMembros.tsx:515` grava `profiles.email` sem lowercase; `create-user/index.ts:98` e `bulk-generate-access/index.ts:60` fazem lookup case-sensitive (`eq`/`in`) enquanto o índice único é `lower(email)` (`20260819163100:90-91`). |
| (b) | Perfil sem `auth.users` (user_id null) → reset "sucede" em silêncio | **Confirmada pelo código como estado de primeira classe**: `create-user/index.ts:86-90,172-186` cria "profile-only"; `AdminMembros.tsx:511-522` adiciona e-mail ao perfil sem criar auth. `resetPasswordForEmail` (GoTrue) devolve 200 para e-mail inexistente (anti-enumeração) → `Login.tsx:43` mostra "Email de recuperação enviado!" sem que exista usuário. Login → "Invalid login credentials" → `Login.tsx:65`. **Casa exatamente com os dois sintomas.** |
| (c) | `redirectTo` / rota / hash | Rota existe (`App.tsx:94`) e o handler cobre PKCE, hash e token_hash (`ResetPassword.tsx:26-63`). **Depende de config no painel**: se `${origin}/reset-password` não estiver em *Redirect URLs*, o GoTrue cai no *Site URL* (`/` → `LoginPage`), o cliente consome o hash e `Login.tsx:23-27` redireciona ao dashboard sem nunca mostrar o form de nova senha. `client.ts:12-17` não define `flowType` (implícito), então o ramo `?code=` (`ResetPassword.tsx:26-34`) nunca ocorre. |
| (d) | Duplicatas/merge apontando user_id errado | **Parcialmente confirmada**: trigger antigo (`20260317183404:9-24`) criava perfil novo a cada `createUser` → duplicatas; dedup em `20260819163100:11` usa `d.email = k.email` (case-sensitive) e pode ter deixado pares com case diferente. `admin-merge-profiles/index.ts:216-223` apaga `user_roles` do loser e **mantém** o auth user → usuário órfão que loga (sem erro) e fica travado no Login (ver Lógica). Não gera "incorretos", mas gera "não consigo entrar". |
| (e) | Inativo / banido / e-mail não confirmado | `is_active` **não bloqueia login** (`useAuth.tsx:150-152`, `admin-set-user-active/index.ts:60-61` só toca `profiles`). Ninguém no código usa `ban_duration`. **`email_confirmed_at IS NULL` é plausível**: `Login.tsx:136-140` expõe "Criar conta" público; se "Confirm email" estiver ativo e o e-mail não chegar (hip. g), o GoTrue retorna "Email not confirmed", que `Login.tsx:65` traduz para "Email ou senha incorretos". A migration `20260820210127:3-5` já corrigiu manualmente um caso idêntico → **há precedente no próprio repo**. |
| (f) | Política de senha diferente | **Refutada**: todas as senhas geradas (`create-user:66-73`, `reset-and-invite:68-76`, `bulk-generate-access:86`) têm ≥12 chars com maiúscula/minúscula/dígito/símbolo. Problema real adjacente: `AdminMembros.tsx:568` mostra a senha **apenas num toast efêmero** (`Membro criado! Senha: ...`) — fácil o admin perder e repassar errado; e `useAuth.tsx:135` não faz `trim()` na senha (espaço final ao colar do WhatsApp = "incorretos"). |
| (g) | SMTP / rate limit | **Não há SMTP customizado no repo**: `config.toml` só tem `project_id` e `verify_jwt`; nenhum `[auth.email.smtp]`. O serviço de e-mail padrão do Supabase **só entrega para e-mails de membros da organização** e tem limite de poucas mensagens/hora. Como o produto foi desenhado para o admin enviar senha por WhatsApp (`AccessCredentialsDialog.tsx:25-35`, `email_confirm: true` em todas as functions), é muito provável que SMTP nunca tenha sido configurado → **o e-mail de reset nunca chega para nenhum membro**. Depende de verificação no painel. |
| (h) | Mensagem genérica engole causas | **Confirmada**: `Login.tsx:63-66` colapsa `Invalid login credentials`, `Email not confirmed`, `User is banned`, `Too many requests`, erro de rede etc. em "Email ou senha incorretos". |

### Diagnóstico ranqueado

1. **Não existe `auth.users` para o e-mail que o membro digita** — perfil criado sem acesso (profile-only) ou e-mail do perfil editado/corrigido em `AdminMembros.tsx:515` sem propagar ao auth (typo antigo no auth). Explica 100% dos sintomas sem depender de config externa.
2. **SMTP não configurado** → nenhum e-mail de recuperação sai para não-membros da org; a senha original simplesmente foi perdida/passada errada (toast efêmero, espaço ao colar).
3. **Conta auto-criada por "Criar conta" com e-mail não confirmado** (`email_confirmed_at IS NULL`) porque o e-mail de confirmação também nunca chegou → "Email not confirmed" mascarado.
4. **Redirect URL não permitido** → link de reset (quando chega) cai em `/` e o usuário é jogado no dashboard sem trocar a senha (ou, sem roles, fica travado).
5. Perfil mesclado/duplicado com roles apagados → login "funciona" mas trava (não é "incorretos"; menor probabilidade para estes dois).

### Checklist para o admin (painel Supabase)

**Auth > Users**
- Buscar `emerson` e `rogerio`/`rogério`: existe usuário? Coluna *Email Confirmed*? *Last sign in*? *Banned until*? Provider = email?
- Comparar o e-mail exato do auth com o e-mail que o membro está digitando e com `profiles.email`.

**Auth > Providers > Email**: "Confirm email" ligado? "Secure email change"? Min password length?

**Auth > URL Configuration**: *Site URL* = domínio de produção; *Redirect URLs* contém `https://<dominio>/reset-password` (e o domínio do PWA/preview, se usado).

**Project Settings > Auth > SMTP Settings**: "Enable Custom SMTP" está ativo? Se não → e-mails só chegam para membros da org. Verificar também *Rate Limits* (Auth > Rate Limits > "emails sent").

**Logs > Auth Logs**: filtrar por `emerson`/`rogerio` e por `path=/token` (ver `error_code`: `invalid_credentials`, `email_not_confirmed`, `user_banned`, `over_request_rate_limit`) e `path=/recover` (ver se disparou `mail_sent` ou "user not found").

**SQL (SQL Editor)**

```sql
-- 1) Visão cruzada auth × profiles × roles
select
  u.id            as auth_user_id,
  u.email         as auth_email,
  u.email_confirmed_at,
  u.banned_until,
  u.last_sign_in_at,
  u.created_at    as auth_created_at,
  p.id            as profile_id,
  p.email         as profile_email,
  p.user_id       as profile_user_id,
  p.full_name, p.member_tier, p.is_active, p.onboarding_completed,
  array_agg(r.role) filter (where r.role is not null) as roles
from public.profiles p
full outer join auth.users u
  on u.id = p.user_id or lower(u.email) = lower(p.email)
left join public.user_roles r on r.user_id = coalesce(p.user_id, u.id)
where p.full_name ilike '%emerson%' or p.email ilike '%emerson%' or u.email ilike '%emerson%'
   or p.full_name ilike '%rog%rio%' or p.email ilike '%rogerio%' or u.email ilike '%rogerio%'
group by u.id, p.id
order by p.full_name;

-- 2) Perfis com e-mail mas SEM acesso (candidatos a "e-mail ou senha incorretos")
select id, full_name, email, member_tier, is_active, created_at
from public.profiles
where user_id is null and email is not null
order by created_at desc;

-- 3) Perfis cujo e-mail diverge do e-mail do auth (typo/edição direta)
select p.id, p.full_name, p.email as profile_email, u.email as auth_email
from public.profiles p
join auth.users u on u.id = p.user_id
where lower(trim(p.email)) is distinct from lower(u.email);

-- 4) Usuários auth sem perfil e/ou sem role (travam no Login após autenticar)
select u.id, u.email, u.email_confirmed_at,
       exists(select 1 from public.profiles p where p.user_id = u.id) as has_profile,
       exists(select 1 from public.user_roles r where r.user_id = u.id) as has_role
from auth.users u
where not exists(select 1 from public.profiles p where p.user_id = u.id)
   or not exists(select 1 from public.user_roles r where r.user_id = u.id);

-- 5) E-mails não confirmados (auto-cadastro com e-mail que nunca chegou)
select id, email, created_at from auth.users where email_confirmed_at is null;

-- 6) Espaços/caixa alta em profiles.email
select id, full_name, email from public.profiles
where email <> lower(trim(email));
```

Correção operacional imediata (sem código): para cada um, usar **Gerar acesso** (`reset-and-invite`) na tela de membros e enviar a senha pelo WhatsApp; se o auth existir com e-mail diferente, corrigir via edição completa (`AdminMembroEditar` → `admin-update-user`, que sincroniza auth) e não pela edição rápida.

### Achados do bug

- [SEVERIDADE: crítico] `src/pages/Login.tsx:36-45` — `resetPasswordForEmail` sempre exibe "Email de recuperação enviado!" mesmo quando não há usuário em `auth.users` (GoTrue retorna 200 por anti-enumeração) — membro profile-only/e-mail divergente acredita que o e-mail virá e ele nunca vem — antes de chamar, consultar uma RPC `SECURITY DEFINER` que verifique se existe acesso para o e-mail (ou instruir "se não receber em 5 min, fale com o suporte" + link real de suporte) e normalizar `email.trim().toLowerCase()`.
- [SEVERIDADE: crítico] `src/pages/Login.tsx:63-66` — todo erro de `signIn` vira "Email ou senha incorretos" — mascara `Email not confirmed`, `User is banned`, `Too many requests`, rede — mapear `error.code`/`status` do AuthError (`email_not_confirmed`, `invalid_credentials`, `user_banned`, `over_request_rate_limit`) para mensagens distintas em PT.
- [SEVERIDADE: crítico] `src/pages/AdminMembros.tsx:511-522` — edição rápida grava `profiles.email` sem lowercase e **sem sincronizar `auth.users.email`** — perfil mostra e-mail novo, login continua exigindo o antigo; reset vai para e-mail antigo/nenhum — rotear a edição pelo `admin-update-user` (que já faz `updateUserById({email})`), e normalizar.
- [SEVERIDADE: alto] `supabase/config.toml` (arquivo inteiro) — nenhuma configuração de SMTP/auth versionada; serviço de e-mail padrão do Supabase só entrega para membros da org — nenhum membro recebe reset/confirmação — configurar Custom SMTP no painel (e documentar), ou remover o fluxo "Esqueci minha senha" e substituir por "Solicitar nova senha ao suporte".
- [SEVERIDADE: alto] `src/pages/Login.tsx:136-140` + `src/hooks/useAuth.tsx:155-165` — cadastro público habilitado numa plataforma fechada — cria contas sem role (travam), gera `email_confirmed_at NULL` quando o e-mail não chega (caso da migration `20260820210127`) e, via trigger `20260821205542:10-24`, **vincula o cadastro a um perfil órfão com o mesmo e-mail** — remover o modo `signup` do Login e desabilitar "Allow new users to sign up" no painel.
- [SEVERIDADE: alto] `src/pages/AdminMembros.tsx:567-569` — senha gerada no `create-user` aparece só em toast transitório — admin perde a senha e repassa errado → "incorretos" — reutilizar `AccessCredentialsDialog` (como em `handleInvite`, linhas 632-637).
- [SEVERIDADE: médio] `src/hooks/useAuth.tsx:135` — senha não passa por `trim()` — espaço ao colar do WhatsApp gera credenciais inválidas — não alterar a senha silenciosamente, mas detectar espaço nas pontas e avisar ("sua senha tem espaço no início/fim").
- [SEVERIDADE: médio] `src/pages/ResetPassword.tsx:15-77` + `src/integrations/supabase/client.ts:12-17` — depende de `redirectTo` estar na allow-list do painel; sem isso o link cai em `/` (`App.tsx:92`) e `Login.tsx:23-27` manda para o dashboard sem trocar senha — registrar `/reset-password` nas Redirect URLs e, em `useAuth`, tratar o evento `PASSWORD_RECOVERY` navegando para `/reset-password`.
- [SEVERIDADE: médio] `supabase/functions/reset-and-invite/index.ts:106-111` — `update({user_id})` e `upsert(user_roles)` sem checar erro — se `UNIQUE(user_id)` (`20260317183035:16`) falhar, retorna `success` com senha nova mas o perfil continua desvinculado — checar `error` e retornar 400.
- [SEVERIDADE: médio] `supabase/functions/reset-and-invite/index.ts:94` — `createUser({ email: profile.email })` sem `trim().toLowerCase()` — inconsistência com `create-user:92` — normalizar.
- [SEVERIDADE: médio] `supabase/migrations/20260819163100_...sql:11` — dedup por `d.email = k.email` (case-sensitive) antes de criar índice `lower(email)` — pares com caixa diferente podem não ter sido mesclados (ou a migration falhou parcialmente) — rodar a query 3/6 acima e mesclar pelo painel.
- [SEVERIDADE: baixo] `src/pages/Login.tsx:35` — `import()` inline do client dentro do handler — viola regra de imports no topo; `useAuth` já importa o mesmo módulo — importar no topo.

---

## 2. Lógica/Dados

- [SEVERIDADE: crítico] `src/components/ProtectedRoute.tsx:30-42` — o redirecionamento por papel só ocorre `if (!hasAccess && roles.length > 0)`; com `roles = []` a rota renderiza `children` — qualquer usuário autenticado sem role (auto-cadastro, roles apagados pelo merge `admin-merge-profiles:220`, ou o instante antes de `fetchRoles` resolver) acessa **qualquer** rota, inclusive `/admin/*` — quando `allowedRoles` existir e `roles.length === 0`, mostrar spinner enquanto roles carregam e, se resolverem vazias, redirecionar para uma tela "sem acesso" com logout.
- [SEVERIDADE: alto] `src/hooks/useAuth.tsx:85-89,94` e `:117-121` — `setLoading(false)` é chamado antes de `fetchProfile`/`fetchRoles` terminarem (setTimeout 0 / promessas não aguardadas) — `ProtectedRoute` decide com `roles=[]`: flash de conteúdo errado, gate de onboarding pula (`profile` null), queries disparam sem contexto — expor `rolesLoaded`/`profileLoaded` (ou manter `loading=true` até `Promise.all`), como já se faz em `signIn:146`.
- [SEVERIDADE: alto] `src/pages/Login.tsx:23-27,67` — após `signIn` OK exibe "Acesso confirmado. Entrando..." mas o redirect exige `roles.length > 0` — usuário sem role fica preso no Login sem feedback (loading infinito percebido) — se roles vierem vazias após carregar, mostrar erro "Conta sem perfil de acesso, contate o suporte" e deslogar.
- [SEVERIDADE: alto] `supabase/functions/admin-update-user/index.ts:85-98` — whitelist não inclui `session_rate` (nem `is_active`), mas `src/pages/AdminMentores.tsx:126` envia `session_rate` em `profile_updates` — valor/hora do mentor **nunca é atualizado** na edição, silenciosamente — adicionar `session_rate` à whitelist.
- [SEVERIDADE: alto] `supabase/functions/admin-merge-profiles/index.ts:216-223,235-237` — quando ambos têm auth, apaga `user_roles` do loser mas mantém o `auth.users` — cria conta que autentica, não tem perfil (`profiles.user_id` nulo pois loser é deletado em 232) nem role → trava no Login; o `auth_kept` só informa — banir o auth do loser (`updateUserById({ ban_duration })`) ou registrar no log e exibir aviso ao admin.
- [SEVERIDADE: alto] `supabase/migrations/20260317183035_...sql:7` — `profiles.user_id REFERENCES auth.users ON DELETE CASCADE` — apagar um usuário no painel Auth apaga o perfil e, em cascata, bookings/NPS/etc. (`liberty_id ... ON DELETE CASCADE` em `20260625194840:5`, `20260701211407:4`) — mudar para `ON DELETE SET NULL` (o perfil vira órfão, histórico preservado).
- [SEVERIDADE: médio] `src/components/AccessManagement.tsx:129-141` — `toggleActive` grava `profiles.is_active` direto, ignorando `admin-set-user-active` — não cancela sessões futuras como o fluxo de `AdminMembros.tsx:653` promete — invocar a function.
- [SEVERIDADE: médio] `src/components/AccessManagement.tsx:110-127` — super admin pode remover o próprio `super_admin` (auto-lockout) — bloquear toggle quando `userId === user.id && role === "super_admin"`.
- [SEVERIDADE: médio] `src/hooks/useAuth.tsx:183-187` vs `src/components/ProtectedRoute.tsx:31-36` — regras de herança de papel duplicadas e divergentes (`hasRole` não considera super_admin ⊇ mentor/liberty; `ProtectedRoute` sim) — centralizar num helper único.
- [SEVERIDADE: médio] `src/components/ProtectedRoute.tsx:45-54` vs `src/components/OnboardingGate.tsx:5-8` — o gate é "hard" (redireciona para `/onboarding` em qualquer rota), mas o banner documenta um modelo "soft" (navega, ações bloqueadas) — banner nunca renderiza; design contraditório — escolher um modelo e remover o outro.
- [SEVERIDADE: médio] `supabase/functions/reset-and-invite/index.ts:51-57` — chamada só com `user_id` e sem perfil retorna "Cadastro sem e-mail" — mensagem errada para o caso "perfil não encontrado" — separar os dois casos.
- [SEVERIDADE: médio] `supabase/functions/reset-and-invite/index.ts:66,107` — perfil sem auth de um admin recebe role `liberty` por padrão — admin vira membro — exigir `role` explícito quando não há roles existentes.
- [SEVERIDADE: médio] `supabase/functions/bulk-generate-access/index.ts:119-126` — comentário e lógica assumem que o trigger cria perfil novo; desde `20260821205542` o trigger vincula o órfão — código de limpeza obsoleto, e `delete` sem checar erro — atualizar/remover.
- [SEVERIDADE: médio] `supabase/functions/create-user/index.ts:96-99` + `:109-114` — se já existe perfil com **mesmo e-mail em caixa diferente e com `user_id`**, o `eq` não acha, `createUser` dispara o trigger que faz `INSERT` e viola `profiles_email_unique_idx` → erro "Database error creating new user" cru — usar `ilike`/`lower()` no lookup.
- [SEVERIDADE: médio] `supabase/functions/admin-update-user/index.ts:67` — compara `email !== targetProfile.email` sem normalizar — mudança só de caixa dispara update de auth desnecessário; caso contrário, diferença real por espaços passa despercebida — normalizar ambos os lados.
- [SEVERIDADE: médio] `supabase/functions/admin-update-user/index.ts:103` — grava e-mail no perfil mesmo quando o auth update falhou/não existe `user_id` — perfil e auth divergem (mesmo problema do bug) — só gravar após sucesso do auth, ou marcar visualmente "sem acesso".
- [SEVERIDADE: médio] `supabase/functions/admin-delete-user/index.ts:59-85` — nenhum `error` verificado nas ~12 deleções; `single()` em 51 ignora erro — deleção parcial retorna `success: true` — checar erros e/ou mover para uma função SQL transacional.
- [SEVERIDADE: médio] `supabase/functions/admin-merge-profiles/index.ts:205-207,214,218-221` — updates sem checagem de erro e sem transação — merge parcial irrecuperável pelo `undo` — RPC SQL transacional.
- [SEVERIDADE: médio] `supabase/migrations/20260630152859_...sql:42-45` e `20260701124517_...sql:97-100` — dois triggers (`sync_profile_user_lookup_on_profiles` e `trg_sync_profile_user_lookup`) executam a mesma função em `profiles` — trabalho duplo em cada update de `user_id` — dropar um.
- [SEVERIDADE: médio] `src/pages/ResetPassword.tsx:87-94` — após `updateUser` navega para `/login` mantendo a sessão de recuperação; `Login.tsx:23-27` redireciona ao dashboard — fluxo funciona por acidente; se roles vazias, trava — chamar `signOut()` e mostrar "Senha atualizada, entre novamente", ou navegar direto ao dashboard.
- [SEVERIDADE: baixo] `src/pages/ResetPassword.tsx:36-46` — ramo de hash raramente executa: com `detectSessionInUrl` padrão o supabase-js já consumiu e limpou o hash antes do `useEffect` — código redundante (o fallback `getSession` em 60-63 é o que funciona) — simplificar para `onAuthStateChange(PASSWORD_RECOVERY)` + `getSession`.
- [SEVERIDADE: baixo] `src/hooks/useAuth.tsx:85-89` + `:142-146` — `signIn` e `onAuthStateChange` disparam `fetchProfile/fetchRoles` duas vezes para o mesmo login — requisições duplicadas — deduplicar por `userId` em ref.
- [SEVERIDADE: baixo] `src/hooks/useAuth.tsx:44-61,63-76` — após 3 falhas o estado permanece o anterior sem sinalizar erro — UI mostra vazio sem explicação — expor `error` no contexto.
- [SEVERIDADE: baixo] `src/pages/Onboarding.tsx:215-217` — redirect `if (!user)` redundante com `ProtectedRoute` (`App.tsx:95`) — duplicação — remover.
- [SEVERIDADE: baixo] `src/pages/Onboarding.tsx:285-290` — `handleFinish()` chamado sem `await` dentro de `handleNext` após `setSaving(false)` — flicker de `saving` e dois updates (`persistStep` + `onboarding_completed`) — unificar num único `update` no último passo.
- [SEVERIDADE: baixo] `src/pages/Onboarding.tsx:223-231` — falha do IBGE é silenciada (`catch(() => {})`) — usuário não sabe por que a lista de cidades está vazia — toast/aviso leve.
- [SEVERIDADE: baixo] `src/components/AccessManagement.tsx:143-149` — envia `user_id` no body, mas `admin-delete-user/index.ts:43` só lê `profile_id` — parâmetro morto — remover.
- [SEVERIDADE: baixo] `src/components/AccessCredentialsDialog.tsx:21` — `loginUrl` usa `window.location.origin` — admin logado num preview/PWA envia link errado ao membro — usar constante de domínio de produção.
- [SEVERIDADE: baixo] `src/components/AccessCredentialsDialog.tsx:22` — fallback `"olá"` gera "Olá, olá!" — texto estranho — usar "Olá!" quando não houver nome.

---

## 3. UX / Consistência visual / Acessibilidade

- [SEVERIDADE: alto] `src/pages/Login.tsx:151` — link de suporte aponta para `https://wa.me/5511999999999` (número placeholder) — membros travados (exatamente o caso deste bug) não conseguem falar com ninguém — configurar o número real (idealmente via env/`system_config`).
- [SEVERIDADE: médio] `src/pages/Login.tsx:107-108,113-114,119-121` — `<label>` sem `htmlFor`, inputs sem `id`/`name`/`autoComplete` (`email`, `current-password`, `new-password`) — leitores de tela não associam rótulo; iOS/gerenciadores de senha não autopreenchem (aumenta erro de digitação) — adicionar `id/htmlFor/name/autoComplete`.
- [SEVERIDADE: médio] `src/pages/Login.tsx:122-124` — botão mostrar/ocultar senha sem `aria-label`/`aria-pressed` — ícone sem nome acessível — `aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}`.
- [SEVERIDADE: médio] `src/pages/Login.tsx:137-144` — botões de troca de modo sem `type="button"` e não desabilitados durante `loading` — mudar de modo no meio do submit troca o texto do formulário e o resultado do toast fica incoerente — `type="button"` + `disabled={loading}`.
- [SEVERIDADE: médio] `src/pages/ResetPassword.tsx:129-145` — sem campo de confirmação, sem toggle de visibilidade, sem "Cancelar/Voltar" e `label` sem `htmlFor` — erro de digitação da nova senha vira novo ticket de "senha incorreta" — adicionar confirmação, toggle e link "Voltar ao login".
- [SEVERIDADE: médio] `src/pages/ResetPassword.tsx:90` — `toast.error(error.message)` exibe texto do GoTrue em inglês ("New password should be different…", "Auth session missing!") — idioma misturado — mapear para PT.
- [SEVERIDADE: médio] `src/pages/Login.tsx:41,52` — `toast.error(error.message)` cru (inglês) nos modos forgot/signup — idem — mapear.
- [SEVERIDADE: médio] `src/pages/Login.tsx:129-131` vs `src/pages/ResetPassword.tsx:142` vs `src/pages/Onboarding.tsx:605` — Login/Reset usam `.btn-silver` (`rounded-lg`, `uppercase tracking-wider`, `px-6 py-3`, `src/index.css:237-239`); Onboarding usa `<Button size="lg">` do shadcn (`rounded-md`, sem uppercase) — dois sistemas de botão no mesmo funil — padronizar num único componente.
- [SEVERIDADE: médio] `src/pages/Login.tsx:114` vs `src/pages/Onboarding.tsx:365,535-540` — inputs `.input-begin` (`rounded-lg px-4 py-3`, `src/index.css:246-248`) vs `<Input className="h-11">`/`<select rounded-md>` — radius, altura e borda diferentes — unificar.
- [SEVERIDADE: médio] `src/pages/Login.tsx:99-102` (`h2 text-xl`) vs `src/pages/ResetPassword.tsx:127` (`h2 text-xl`) vs `src/pages/Onboarding.tsx:588` (`h1 text-2xl md:text-4xl font-bold`) — hierarquia tipográfica inconsistente no mesmo fluxo — definir escala.
- [SEVERIDADE: baixo] `src/pages/Login.tsx:98` (`p-8 sm:p-10`) vs `src/pages/ResetPassword.tsx:126` (`p-8`) — espaçamento do card diverge — igualar.
- [SEVERIDADE: baixo] `src/pages/ResetPassword.tsx:97-103,105-117` — spinner e estado "Link inválido" sem `role="status"`/`aria-live`; a tela de link inválido não oferece "reenviar e-mail" — beco sem saída — link para `/login` em modo forgot.
- [SEVERIDADE: baixo] `src/pages/Onboarding.tsx:334-338` — `Label` é `<label>` sem `htmlFor` e os inputs não têm `id` — 40+ campos inacessíveis — gerar `id={f.key}`.
- [SEVERIDADE: baixo] `src/pages/Onboarding.tsx:573-575` — "Sair" faz `signOut()` sem confirmação no meio de um formulário de 6 etapas — perda percebida de progresso (há rascunho local, mas o usuário não sabe) — confirm ou aviso "seu rascunho fica salvo".
- [SEVERIDADE: baixo] `src/pages/Onboarding.tsx:596-604` — "Voltar" fica `disabled` no passo 0; não há como sair para o dashboard (o gate hard impede) — usuário preso até completar — aceitável se intencional, mas explicitar na UI.
- [SEVERIDADE: baixo] `src/components/AccessManagement.tsx:203-208` — input de busca sem `aria-label`; tabs (`185-200`) sem `role="tablist"/aria-selected`; toggles de papel (`233-246`) sem `aria-pressed` — a11y básica — adicionar atributos.
- [SEVERIDADE: baixo] `src/components/AccessManagement.tsx:278-288` — botão "Ativo/Inativo" alterna estado sem confirmação nem indicação de que é clicável — inativação acidental — confirm + `title`.
- [SEVERIDADE: baixo] `src/components/AccessCredentialsDialog.tsx:102-115` — botões sem `type="button"`; "Fechar" com estilo customizado ao lado de `.btn-silver` — mistura de estilos — usar `<Button variant="outline">`.
- [SEVERIDADE: baixo] `src/components/AccessCredentialsDialog.tsx:38-50` — cópia automática para o clipboard ao abrir pode falhar por permissão e o toast de sucesso só aparece se der certo; sem feedback de falha — admin acha que copiou — mostrar estado explícito.
- [SEVERIDADE: baixo] `src/pages/AdminMentores.tsx:264` — `toast.error("Erro: " + e.message)` cru vs `translateErrorToPt` em `AdminMembros.tsx:639` — padrões de mensagem diferentes entre telas irmãs — unificar.
- [SEVERIDADE: baixo] `supabase/functions/create-user/index.ts:59,194-196` e `reset-and-invite/index.ts:14,24,32` — mensagens de API em inglês ("Missing required fields", "User created with role", "Not authorized") misturadas com PT ("Role inválido", "Já existe um membro…") — chegam ao toast — padronizar PT.

---

## 4. Segurança

- [SEVERIDADE: crítico] `supabase/migrations/20260701124517_...sql:88-94` (policy vigente "Admins can manage roles") + `src/components/AccessManagement.tsx:117` — RLS permite a **qualquer admin** inserir `user_roles` para si com `role='super_admin'` (UI restringe a super admin, RLS não) — escalada de privilégio — policy: `admin` só gerencia `mentor`/`liberty`; `super_admin` exigido para `admin`/`super_admin`; ou mover para edge function com checagem.
- [SEVERIDADE: crítico] `supabase/functions/create-user/index.ts:40-45,79` — checagem aceita `admin` e permite `role` `admin`/`super_admin` — admin comum cria um super admin — exigir `super_admin` para papéis administrativos.
- [SEVERIDADE: crítico] `supabase/functions/reset-and-invite/index.ts:28-33,114-116` e `admin-update-user/index.ts:33-40,73-76` — admin comum pode redefinir senha/e-mail de **qualquer** usuário, inclusive super admins, e recebe a senha em texto claro — takeover de conta superior — bloquear alvo com papel ≥ ao do chamador.
- [SEVERIDADE: alto] `supabase/migrations/20260701124517_...sql:69-74` ("Users can update own profile") — sem restrição de colunas; membro pode `UPDATE profiles SET member_tier='liberty', is_active=true, onboarding_completed=true, program_end_date=..., session_rate=...` via API — auto-upgrade/reativação — trigger `BEFORE UPDATE` que rejeita mudança dessas colunas quando `auth.role()='authenticated'` e não é admin, ou view/RPC para edição própria.
- [SEVERIDADE: alto] `supabase/migrations/20260821205542_...sql:10-24` + `src/hooks/useAuth.tsx:155-165` — trigger vincula novo `auth.users` ao perfil órfão de mesmo e-mail; com cadastro público aberto, quem conhecer o e-mail de um membro ainda sem acesso cria a conta e herda o perfil (PII do onboarding, histórico) — takeover de perfil — desligar signup público e/ou só vincular quando `email_confirmed_at IS NOT NULL` (trigger em `UPDATE OF email_confirmed_at`).
- [SEVERIDADE: alto] `supabase/functions/bulk-generate-access/index.ts:86` — senhas padrão fixas `"Liberty@2026"`/`"Mentor@2026"` para todos — senha compartilhada e previsível; function não é chamada por nenhum código do `src/` (só via API) — remover ou gerar aleatória como as demais.
- [SEVERIDADE: alto] `supabase/functions/admin-delete-user/index.ts:33-40,83-85` — admin comum pode apagar definitivamente um super admin — destruição de conta superior — mesma regra de hierarquia.
- [SEVERIDADE: médio] `supabase/config.toml:5-49` — `verify_jwt = false` em todas as functions; as sete auditadas validam token + papel admin internamente (OK), mas `seed-demo-members`, `seed-mentors`, `bulk-import-members`, `bulk-upsert-members-full`, `send-push`, `google-*`, `organize-zoom-report` (fora do escopo) precisam da mesma verificação — conferir cada uma e apagar as `seed-*` de produção.
- [SEVERIDADE: médio] `supabase/functions/*/index.ts:3-7` (todas) — `Access-Control-Allow-Origin: *` — com JWT obrigatório o risco é baixo, mas amplia superfície para CSRF de leitura via token vazado — restringir aos domínios do app.
- [SEVERIDADE: médio] `supabase/functions/create-user/index.ts:201`, `reset-and-invite:135`, `admin-*:` blocos `catch` — devolvem `err.message` cru (stack/SQL) ao cliente — vazamento de detalhes internos — logar no servidor e devolver mensagem genérica.
- [SEVERIDADE: médio] `supabase/functions/reset-and-invite/index.ts:123-131` e `bulk-generate-access:147` — senha em texto claro na resposta HTTP (fica em logs do Edge Runtime/rede) — exposição — aceitável só com logging desligado para o body; considerar link de convite (`generateLink`) quando SMTP existir.
- [SEVERIDADE: médio] `supabase/migrations/20260701124517_...sql:60-66` ("Admins can manage all profiles" FOR ALL) — admin pode alterar `profiles.user_id` diretamente e re-apontar um perfil para outro login — sequestro de perfil — proibir update de `user_id` fora de `service_role` (trigger).
- [SEVERIDADE: baixo] `supabase/migrations/20260528191610` e `20260820210127` — histórico de migrations redefinindo senha/confirmando e-mail de usuários específicos — prática já removida, mas mostra que operações de auth foram feitas via SQL — manter apenas pela Admin API/painel.
- [SEVERIDADE: baixo] `src/integrations/supabase/previewAuthStorage.ts:1-88` — em domínio de produção retorna `localStorage` (correto); em preview envia token da sessão para o editor via `postMessage` — comportamento herdado do Lovable; garantir que builds de produção nunca rodem em `PREVIEW_ZONES`.

---

## 5. Código morto / qualidade

- [SEVERIDADE: médio] `src/components/OnboardingGate.tsx:45-54` — `useOnboardingLocked` não é importado em nenhum lugar — código morto — remover.
- [SEVERIDADE: médio] `src/components/OnboardingGate.tsx:9-40` — `OnboardingGateBanner` é renderizado em `AppLayout.tsx:209`, mas o gate hard de `ProtectedRoute.tsx:45-54` impede que um liberty com `onboarding_completed=false` chegue a qualquer tela com `AppLayout` — nunca aparece — remover ou trocar o modelo de gate.
- [SEVERIDADE: médio] `supabase/functions/bulk-generate-access/index.ts` — sem chamador no `src/` — function órfã com senhas fixas — remover do deploy e do `config.toml:48-49`.
- [SEVERIDADE: baixo] `src/pages/ResetPassword.tsx:26-34` — ramo `?code=` nunca ocorre com `flowType` implícito (`client.ts:12-17`) — código morto condicional — remover ou configurar `flowType: "pkce"`.
- [SEVERIDADE: baixo] `src/hooks/useAuth.tsx:12,16-17` — `google_connected`, `is_active`, `onboarding_completed` opcionais mas `fetchProfile` faz `select("*")` com cast `as unknown as Profile` — tipagem frouxa — usar `Database["public"]["Tables"]["profiles"]["Row"]`.
- [SEVERIDADE: baixo] `src/hooks/useAuth.tsx:172` — `new Error("No profile")` em inglês, nunca exibido traduzido — mensagem interna inconsistente — PT ou código de erro.
- [SEVERIDADE: baixo] `src/pages/Onboarding.tsx:184,189,268` — `(profile as any)` e `payload as any` — perde checagem de tipos das ~35 colunas — tipar via `Row`.
- [SEVERIDADE: baixo] `src/pages/Onboarding.tsx:243-247` — `useMemo` com `eslint-disable react-hooks/exhaustive-deps` para incluir `isFieldValid` — supressão evitável — mover `isFieldValid` para fora do componente recebendo `answers`/`marginUnknown`.
- [SEVERIDADE: baixo] `src/components/AccessManagement.tsx:66,71,79,92,96,101,214` — `any` generalizado nos itens de usuário — sem tipos — definir `type AccessUser`.
- [SEVERIDADE: baixo] `src/components/AccessManagement.tsx:56-64` — `.in("user_id", userIds.length ? userIds : ["0000…"])` — hack para evitar `in()` vazio — legibilidade — early-return quando não há ids.
- [SEVERIDADE: baixo] `supabase/functions/create-user/index.ts:201` — `err.message` com `err` do tipo `unknown` (Deno strict) — falha de type-check em `deno check` — `(err as Error).message` como nas demais functions.
- [SEVERIDADE: baixo] `supabase/functions/*/index.ts:15-52` (todas as 7) — bloco de autenticação/autorização copiado e colado — manutenção arriscada (a regra de hierarquia teria de ser corrigida em 7 lugares) — extrair para `_shared/auth.ts`.
- [SEVERIDADE: baixo] `supabase/functions/create-user/index.ts:66-73`, `reset-and-invite:68-76` — gerador de senha duplicado (e `Math.random` no sufixo numérico) — duplicação; sufixo não-CSPRNG — `_shared/password.ts` com `crypto.getRandomValues` apenas.
- [SEVERIDADE: baixo] `src/pages/Login.tsx:6,9` — `iconBegin` usado só como marca d'água `hidden lg:block` com `alt=""`; `Logo` importado duas vezes em breakpoints — ok, mas o `<img>` de 800px é carregado no mobile mesmo oculto — usar CSS background ou `loading="lazy"`.