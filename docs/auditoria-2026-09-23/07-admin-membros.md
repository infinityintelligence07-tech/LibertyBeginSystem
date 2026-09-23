# Auditoria — Módulo Admin de Membros (Liberty Begin)

Nenhum arquivo foi editado. Leitura integral de `AdminMembros.tsx` (1714 linhas), `AdminMembroDetalhes.tsx`, `AdminMembroEditar.tsx`, `MemberProfilePanel.tsx`, `MemberTimeline.tsx`, `AdminMemberNote.tsx`, as 5 edge functions do escopo, mais leitura complementar de `reset-and-invite`, `admin-delete-user`, `admin-set-user-active`, `bulk-generate-access`, `Login.tsx`, `useAuth.tsx`, trigger `handle_new_user` e migrações relevantes.

---

## 1. Acesso/Login dos membros

### Diagnóstico provável para Emerson e Rogério

O sintoma "email ou senha incorretos" + "e-mail de reset não chega" é exatamente o comportamento de um **perfil em `profiles` sem linha correspondente em `auth.users`** (`user_id IS NULL`). O `resetPasswordForEmail` do Supabase responde sucesso mesmo quando o e-mail não existe (anti-enumeração), então o toast "Email de recuperação enviado!" (`Login.tsx:43`) aparece e nada chega. Há **três caminhos no fluxo admin** que produzem esse estado, e **nenhum indicador visual** para o admin perceber.

- [SEVERIDADE: crítico] `supabase/functions/admin-update-user/index.ts:64-83,103` — Quando o perfil não tem `user_id`, o bloco de auth (`if (targetProfile.user_id && ...)`) é pulado e o e-mail é gravado **só em `profiles.email`** (linha 103). Nenhuma conta é criada. — Impacto: admin cria membro sem e-mail ("Novo membro" → só telefone), depois adiciona e-mail em "Editar cadastro completo", recebe "Cadastro atualizado" e o membro nunca consegue logar nem resetar senha. Cenário mais provável para Emerson/Rogério. — Correção: se `!targetProfile.user_id && email`, criar/vincular o usuário em auth (mesma lógica de `reset-and-invite:79-111`) e devolver `{ access_created: true, password }`, ou retornar `{ success: true, warning: "sem acesso" }` e exibir alerta no front.

- [SEVERIDADE: crítico] `supabase/functions/bulk-upsert-members-full/index.ts:130-136` — Se já existe perfil com o e-mail, apenas atualiza campos e retorna `"updated"`; **nunca cria auth quando `existing.user_id` é null**. — Impacto: importar planilha com membros já cadastrados (sem acesso) mostra "Atualizado" e o texto do modal (`AdminMembros.tsx:1431`: "Se o e-mail já existir, o perfil é atualizado; caso contrário, criamos o membro com senha temporária") faz o admin acreditar que todos têm acesso. — Correção: no branch `existing`, se `!existing.user_id`, criar/vincular usuário, atribuir role e devolver `status: "created"` com senha.

- [SEVERIDADE: crítico] `src/hooks/useAdminData.tsx:27-53` + `src/pages/AdminMembros.tsx:1064-1250` — `MemberWithProgress` **não expõe `user_id`**; a lista, o painel expandido (1266-1299) e o detalhe (`AdminMembroDetalhes.tsx:299-334`) não têm nenhum badge "sem acesso". Não existe indicador — nem confiável nem não confiável. — Impacto: admin não consegue distinguir membro com login de membro só cadastrado. — Correção: incluir `user_id` e `has_role` no hook (join com `user_roles`), exibir badge "Sem acesso" (âmbar) na linha, no detalhe e como filtro "Sem acesso"; usar na coluna extra da exportação.

- [SEVERIDADE: crítico] `src/pages/AdminMembros.tsx:879` vs `supabase/functions/create-user/index.ts:65-77` — Texto do formulário: "criamos a conta automaticamente com a senha padrão **Liberty@2026**"; o backend gera senha **aleatória** (`generateRandomPassword`). O mesmo em `handleInvite` (`AdminMembros.tsx:620`: "redefinir a senha para a padrão") vs `reset-and-invite:67-76` (aleatória). — Impacto: admin envia "Liberty@2026" ao membro por WhatsApp → "email ou senha incorretos". Segunda causa plausível. — Correção: corrigir textos para "senha temporária gerada" e sempre exibir a senha via `AccessCredentialsDialog`.

- [SEVERIDADE: alto] `src/pages/AdminMembros.tsx:567-569` — Senha da conta recém-criada é mostrada apenas em um `toast.success` transitório. — Impacto: admin perde a senha; precisa "Gerar acesso" de novo (e o texto de confirmação em 620 confunde). — Correção: abrir `AccessCredentialsDialog` com `data.password`, como faz `handleInvite:632-637`.

- [SEVERIDADE: alto] `src/pages/Login.tsx:63-66` — Qualquer erro de `signIn` (exceto timeout) vira "Email ou senha incorretos". GoTrue devolve mensagens distintas: `Email not confirmed`, `User is banned`, `Email rate limit exceeded`, `Invalid login credentials`. — Impacto: impossível o suporte diagnosticar; um membro que se cadastrou pelo botão público "Criar conta" e não confirmou o e-mail vê a mesma mensagem. — Correção: mapear as mensagens do GoTrue para PT (`Email not confirmed` → "Confirme seu e-mail…", etc.) e logar `error.message` no console.

- [SEVERIDADE: alto] `src/pages/Login.tsx:22-28` + `src/hooks/useAuth.tsx:133-153` — Redirect pós-login exige `roles.length > 0`. Usuário com auth + profile mas **sem linha em `user_roles`** loga com sucesso ("Acesso confirmado. Entrando...") e fica preso na tela de login. — Impacto: perfis criados pelo trigger `handle_new_user` (auto-cadastro público, linha 137-141 do Login) ou casos em que o upsert de role falhou silenciosamente (`reset-and-invite:108-111` ignora erro) nunca entram. — Correção: se `roles.length === 0`, redirecionar para `/dashboard` com fallback ou mostrar "Conta sem perfil — contate o suporte"; garantir role no trigger.

- [SEVERIDADE: alto] `supabase/functions/reset-and-invite/index.ts:90-107` — Quando encontra um usuário auth pré-existente com o mesmo e-mail (linha 90), faz `profiles.update({ user_id })` **ignorando o erro**. Se aquele `user_id` já está vinculado a outro perfil, o trigger `sync_profile_user_lookup` estoura `profile_user_lookup_user_id_key` (UNIQUE em `user_id`, migração `20260630152859:3`), o update falha silenciosamente e a linha 114 **reseta a senha do usuário de outro perfil**. Retorna `success: true` com credenciais que não abrem o perfil do membro. — Correção: checar erro do update; antes de vincular, verificar se `user_id` já pertence a outro perfil e bloquear com mensagem clara.

- [SEVERIDADE: alto] `supabase/functions/create-user/index.ts:94-107`, `bulk-upsert-members-full/index.ts:125-126`, `bulk-import-members/index.ts:87-88`, `bulk-generate-access/index.ts:60` — Busca de perfil por `.eq("email", ...)` é **case-sensitive**; o índice único e o trigger usam `lower(email)`. — Impacto: perfil legado com `Emerson@...` não é encontrado; `create-user` chama `createUser`, o trigger tenta `INSERT` de novo perfil e viola `profiles_email_unique_idx` → "Database error creating new user" (inglês, cru). — Correção: usar `.ilike("email", email)` ou normalizar todos os e-mails no banco (`UPDATE profiles SET email = lower(trim(email))`).

- [SEVERIDADE: alto] `supabase/functions/create-user/index.ts:149,160`, `bulk-upsert-members-full/index.ts:152,160`, `bulk-import-members/index.ts:116,125` — Rollback via `auth.admin.deleteUser(userId)`. Como `profiles.user_id` tem `ON DELETE CASCADE` (migração `20260317183035:7`) e o trigger `handle_new_user` **vincula o perfil órfão já existente** ao novo usuário, o rollback apaga o perfil original do membro e, em cascata, bookings, tarefas, ferramentas. — Impacto: falha rara (role upsert com erro) destrói o histórico do membro. — Correção: antes de deletar o auth user, `UPDATE profiles SET user_id = NULL WHERE user_id = userId AND created_at < now() - interval '1 minute'`; ou não usar cascade em `profiles.user_id`.

- [SEVERIDADE: médio] `src/pages/AdminMembroEditar.tsx:117-124,143-144` + `admin-update-user:71` — Nova senha digitada para perfil sem `user_id` é silenciosamente ignorada; senha < 6 caracteres também (sem aviso). UI mostra "Cadastro atualizado". — Correção: backend devolver `password_updated: false` e front avisar; validar tamanho no front.

- [SEVERIDADE: médio] `supabase/functions/admin-update-user/index.ts:64-116` — Atualização **não atômica**: auth (`updateUserById`, linha 74) e depois `profiles` (linha 106). Se o update do profile falhar (ex.: `profiles_email_unique_idx`), o e-mail de login já mudou e `profiles.email` fica com o antigo. — Impacto: membro loga com e-mail que o admin não vê; busca por e-mail na lista falha. — Correção: validar unicidade em `profiles` antes de tocar no auth; em caso de erro no profile, reverter o auth para `targetProfile.email`.

- [SEVERIDADE: médio] `src/pages/AdminMembroEditar.tsx:143-144` — Mudança de e-mail (que altera o login) não pede confirmação e o toast de sucesso não avisa que o login mudou. — Correção: confirm dedicado ("O e-mail de acesso mudará de X para Y") e toast específico.

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:1187` + `supabase/functions/admin-set-user-active/index.ts:59-66` + `useAuth.tsx:150-152` — Tooltip "Inativar acesso do membro" mas a inativação só seta `is_active=false` e cancela sessões; **o login continua funcionando**. — Impacto: admin acredita ter bloqueado acesso; e, no inverso, membro reativado nunca teve o acesso "reativado" (texto "Reativar acesso do membro"). — Correção: renomear para "Encerrar programa / Reativar programa" ou, se a intenção for bloquear login, usar `ban_duration` em `updateUserById`.

- [SEVERIDADE: médio] `src/pages/Login.tsx:36-38` — `resetPasswordForEmail(email)` sem `trim().toLowerCase()`; `redirectTo` `/reset-password` precisa estar na allowlist de Redirect URLs do projeto; sem `[auth]` em `supabase/config.toml` (configuração só no dashboard). — Impacto: espaço no final → erro em inglês cru (linha 41); URL fora da allowlist → link cai na Site URL e o fluxo de recuperação quebra. — Correção: normalizar e-mail; documentar/checar allowlist e SMTP customizado (o SMTP padrão do Supabase tem limite de poucos e-mails/hora e não é para produção).

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:1141,1148` vs `620` vs `AccessCredentialsDialog.tsx:68` — Mesmo botão: aria-label "Enviar convite por WhatsApp", tooltip "Enviar convite por WhatsApp (e-mail e senha)", confirm "Gerar acesso… redefinir a senha", diálogo "Acesso de Membro liberado". Nada envia pelo WhatsApp; copia uma mensagem. E o confirm fala em "redefinir" mesmo quando a conta ainda nem existe. — Correção: unificar para "Gerar/redefinir acesso" e mostrar texto diferente quando `user_id` é null ("Criar acesso").

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:511-522,874` — Diálogo "Editar dados básicos" desabilita o campo e-mail; o texto de 879 diz "Depois, é só adicionar o e-mail e clicar em Gerar acesso" sem dizer onde. — Impacto: admin não acha onde adicionar e-mail; quando acha (edição completa), cai no bug do `admin-update-user`. — Correção: habilitar e-mail no diálogo básico roteando por `admin-update-user` corrigido, ou linkar explicitamente para "Editar cadastro completo".

- [SEVERIDADE: baixo] `src/pages/AdminMembroEditar.tsx:150-186` — Página é reutilizada na rota `/mentor/alunos/:id/editar` (linha 81-82) e expõe campo "Nova senha" ao mentor; `admin-update-user` recusa com 403 "Not authorized" (inglês). — Correção: esconder o campo de senha/e-mail quando `layoutRole === "mentor"`.

- [SEVERIDADE: baixo] `supabase/functions/bulk-import-members/index.ts` (todo) e `bulk-generate-access/index.ts` (todo) — Não são invocadas por nenhum código do front (só constam em `config.toml`). `bulk-import-members` ainda usa `Math.random` para senha (26-33) e marca perfis sem acesso como "skipped" (90). — Correção: remover `bulk-import-members`; ou aproveitar `bulk-generate-access` para um botão "Gerar acesso para todos sem login" (ele já trata o caso `user_id IS NULL` corretamente, linhas 90-136).

- [SEVERIDADE: baixo] `supabase/functions/admin-merge-profiles/index.ts:216-223` — Branch "ambos têm auth" é inalcançável (bloqueado em 126-139) — código morto. Sobre a pergunta "merge pode deixar `user_id` apontando para usuário apagado": **não diretamente** — a FK `profiles.user_id → auth.users ON DELETE CASCADE` apaga o perfil junto. Mas o **undo** (linhas 73-80) re-insere `loserBefore` com o `user_id` antigo; se aquele auth user foi apagado entre merge e undo (ex.: `admin-delete-user` no vencedor, que deleta `target.user_id` = antigo `user_id` do perdedor, linha 84), o upsert viola FK e o undo falha com erro cru. — Correção: no undo, checar existência em `auth.users` e inserir com `user_id = null` se não existir.

### Queries SQL prontas para diagnóstico (rodar no SQL Editor, como service role)

```sql
-- 1) Perfil(s) do membro por e-mail ou nome (case-insensitive)
SELECT p.id AS profile_id, p.full_name, p.email, p.user_id, p.member_tier, p.is_active,
       p.created_at, p.updated_at
FROM public.profiles p
WHERE p.email ILIKE '%emerson%' OR p.full_name ILIKE '%emerson%'
   OR p.email ILIKE '%rogerio%' OR p.email ILIKE '%rogério%' OR p.full_name ILIKE '%rog_rio%';

-- 2) Existe usuário em auth.users com esse e-mail?
SELECT u.id, u.email, u.email_confirmed_at, u.banned_until, u.last_sign_in_at,
       u.recovery_sent_at, u.created_at, u.raw_user_meta_data->>'full_name' AS meta_name
FROM auth.users u
WHERE u.email ILIKE '%emerson%' OR u.email ILIKE '%rogerio%';

-- 3) Cruzamento completo profiles x auth.users x user_roles para um e-mail
WITH alvo AS (SELECT lower(trim('EMAIL_AQUI')) AS email)
SELECT p.id AS profile_id, p.full_name, p.email AS profile_email, p.user_id AS profile_user_id,
       u.id AS auth_user_id, u.email AS auth_email, u.email_confirmed_at, u.banned_until,
       u.last_sign_in_at, u.recovery_sent_at,
       (SELECT string_agg(r.role::text, ',') FROM public.user_roles r
         WHERE r.user_id = COALESCE(p.user_id, u.id)) AS roles,
       CASE
         WHEN p.id IS NULL THEN 'AUTH SEM PROFILE'
         WHEN u.id IS NULL THEN 'PROFILE SEM AUTH (não consegue logar / reset não chega)'
         WHEN p.user_id IS NULL THEN 'AUTH EXISTE MAS PROFILE NÃO VINCULADO'
         WHEN p.user_id <> u.id THEN 'PROFILE VINCULADO A OUTRO AUTH'
         ELSE 'OK'
       END AS situacao
FROM alvo a
LEFT JOIN public.profiles p ON lower(p.email) = a.email
FULL JOIN auth.users u ON lower(u.email) = a.email;

-- 4) Todos os membros (begin/liberty) SEM conta de acesso
SELECT p.id, p.full_name, p.email, p.member_tier, p.is_active, p.created_at
FROM public.profiles p
WHERE p.user_id IS NULL AND p.member_tier IN ('begin','liberty')
ORDER BY p.created_at DESC;

-- 5) Perfis sem user_id cujo e-mail JÁ existe em auth.users (basta vincular)
SELECT p.id AS profile_id, p.full_name, p.email, u.id AS auth_user_id, u.last_sign_in_at
FROM public.profiles p
JOIN auth.users u ON lower(u.email) = lower(p.email)
WHERE p.user_id IS NULL;

-- 6) Usuários auth com profile mas SEM role (ficam presos na tela de login)
SELECT u.id, u.email, p.id AS profile_id, p.full_name
FROM auth.users u
JOIN public.profiles p ON p.user_id = u.id
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL;

-- 7) Usuários auth sem nenhum profile (auto-cadastro ou trigger falhou)
SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.id IS NULL;

-- 8) E-mails com maiúsculas/espaços em profiles (quebram .eq("email"))
SELECT id, full_name, email FROM public.profiles
WHERE email IS NOT NULL AND email <> lower(trim(email));

-- 9) E-mails duplicados (ignorando caixa)
SELECT lower(email) AS email, count(*), array_agg(id) AS profile_ids, array_agg(user_id) AS user_ids
FROM public.profiles WHERE email IS NOT NULL
GROUP BY lower(email) HAVING count(*) > 1;

-- 10) Divergência profiles.user_id x profile_user_lookup
SELECT p.id, p.user_id, l.user_id AS lookup_user_id
FROM public.profiles p
FULL JOIN public.profile_user_lookup l ON l.profile_id = p.id
WHERE p.user_id IS DISTINCT FROM l.user_id;

-- 11) Tentativas de login / recovery do membro (últimos eventos)
SELECT created_at, payload->>'action' AS action, payload->>'actor_username' AS email,
       payload->'traits'->>'provider' AS provider, payload->>'error' AS error
FROM auth.audit_log_entries
WHERE payload->>'actor_username' ILIKE '%emerson%' OR payload->>'actor_username' ILIKE '%rogerio%'
ORDER BY created_at DESC LIMIT 50;

-- 12) (Correção, só após confirmar com a query 5) vincular perfil órfão ao auth existente
-- UPDATE public.profiles p SET user_id = u.id
-- FROM auth.users u
-- WHERE p.id = 'PROFILE_ID' AND lower(u.email) = lower(p.email) AND p.user_id IS NULL;
-- INSERT INTO public.user_roles (user_id, role) VALUES ('AUTH_USER_ID','liberty') ON CONFLICT DO NOTHING;
```

Interpretação rápida: query 3 retornando `PROFILE SEM AUTH` → usar o botão "Gerar acesso" (ícone de envio) na linha do membro, que cria o usuário e devolve a senha. Retornando `AUTH EXISTE MAS PROFILE NÃO VINCULADO` → query 12. `email_confirmed_at IS NULL` → confirmar manualmente via `updateUserById({ email_confirm: true })`. `banned_until` preenchido → desbanir.

---

## 2. Cruzamento de dados

- [SEVERIDADE: alto] `src/hooks/useAdminData.tsx:129-131` — `bookings.select("*")` sem `.range()`; o PostgREST limita a 1000 linhas por padrão. Já com ~85 membros × 12 sessões o limite é atingido e as contagens da **lista** ficam truncadas silenciosamente, enquanto o **detalhe** (`AdminMembroDetalhes.tsx:159-163`, filtrado por `liberty_id`) não trunca. — Impacto: lista mostra 7/12, detalhe 12/12. — Correção: paginar (`range` em loop) ou agregar via RPC/view (`count` por membro/status).

- [SEVERIDADE: alto] `src/hooks/useAdminData.tsx:166-168,215` vs `src/lib/sessionProgress.ts:28-47` vs `MemberTimeline.tsx:76-79` — Três regras de "realizadas": lista conta **bookings** realizadas de qualquer sessão `order>0` (inclui Liberty `order>=100` e bookings repetidos da mesma sessão); `sessionProgress` conta **sessões únicas** com `.slice(0,12)`; timeline conta bookings cronológicos sem corte. — Impacto: "13/12", "14/12" possíveis; barra de progresso em `AdminMembros.tsx:1065,1212` não tem clamp (>100% de largura), enquanto a exportação clampa (347). — Correção: centralizar em `buildSessionProgress` e usar `completedCount` em lista, detalhe e timeline.

- [SEVERIDADE: alto] `src/pages/AdminMembros.tsx:797-798` + `useAdminData.tsx:173-175,218` vs `AdminMembroDetalhes.tsx:213-224` — Lista: `has_next_session` inclui **qualquer** `pending_approval`, mesmo passada; detalhe: "Próxima" exige data futura. — Impacto: membro com pedido antigo não aprovado aparece com próxima sessão na lista (e sai do filtro "Sem próxima sessão"), mas o detalhe mostra "Próxima: Sem dados"; exportação coluna "Próxima sessão" herda o erro (348). — Correção: em `useMembers`, filtrar `pending_approval` por `!isBookingPast(b)`.

- [SEVERIDADE: médio] `src/components/MemberTimeline.tsx:64` vs `AdminMembroDetalhes.tsx:166` — Timeline filtra só `cancelled` (aceita `not_realized`), mas recebe `memberBookings` já filtradas por `isVisibleSessionBooking` (exclui `not_realized`). — Impacto: o resumo "Não realizadas" (373) nunca aparece a partir do detalhe; se algum outro caller passar bookings brutos, `not_realized` ocupa um slot numerado e desloca "Sessão N". — Correção: usar `isVisibleSessionBooking` na timeline.

- [SEVERIDADE: médio] `src/components/MemberTimeline.tsx:370` — Card "Realizadas · com relatório enviado" usa `slotCounts.completed`, que soma `completed` **e** `awaiting_report` (174). — Impacto: texto contradiz o número. — Correção: separar "Realizadas" e "Aguardando relatório" ou trocar o hint.

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:804-806` vs `1066,1240-1244` — Sem filtro de mês, o chip "No ritmo" filtra `total_completed >= 12` (jornada completa), mas o badge de status da linha usa `monthCount = total_completed` com limiar `>= 2`. — Impacto: linha exibe "No ritmo" para membro com 2 sessões que o filtro "No ritmo" oculta. — Correção: quando `!filterKey`, calcular status pelo ritmo esperado (2/mês desde `program_start_date`) ou pelo `sessionProgress`.

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:1128` — `new Date(member.last_session_date)` sem `T12:00:00` (padrão usado em 846, 1285). — Impacto: em UTC-3, "Última: 14/03" aparece como 13/03. — Correção: usar `formatShortDate`.

- [SEVERIDADE: médio] `src/hooks/useAdminData.tsx:95-126` — Membros são excluídos da lista se tiverem **qualquer** booking como `mentor_id`, disponibilidade ou `mentor_sessions`. — Impacto: um erro de cadastro (mentor errado numa sessão) faz um membro sumir da lista sem aviso, enquanto o detalhe (`/admin/membros/:id`) continua acessível. — Correção: excluir apenas por role; mostrar aviso "perfil com atividades de mentor".

- [SEVERIDADE: médio] `src/hooks/useAdminData.tsx:446-459` vs `AdminMembros.tsx:960-962` — Dashboard conta membros por role `liberty` (exige `user_id`); página conta por `member_tier`. — Impacto: números divergem; a diferença é exatamente o número de membros sem acesso, mas isso não é exibido. — Correção: unificar critério e/ou exibir "X sem acesso".

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:788-790,1106-1108` vs `AdminMembroDetalhes.tsx:299-334` — Lista marca "Inativo" (embora a aba "Encerrados" já filtre, tornando o badge redundante ali); o **detalhe não mostra nenhum indicador de inativo**. — Correção: badge "Programa encerrado" no header do detalhe; `SendNpsButton`/`MemberBookingsManager` deveriam refletir isso.

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:1301-1335` + `1337-1343` — No painel expandido, "Sessões realizadas (N)" lista `completed_sessions` de todos os meses, e logo abaixo `MemberSessionEditor` lista as mesmas sessões filtradas por `filterKey` (`MemberSessionEditor.tsx:62-67`). — Impacto: duas listas da mesma coisa com contagens diferentes quando há filtro de mês; dois botões de excluir para o mesmo booking com regras diferentes (ver Lógica). — Correção: remover o bloco 1301-1335 ou fazer o editor ser a única fonte.

- [SEVERIDADE: médio] `src/pages/AdminMembroDetalhes.tsx:208-210` — `journeySessionIds.size === 0` faz contar tudo (inclusive Onboarding) quando o membro só tem bookings de sessões cujo fetch falhou (erro ignorado em 186). — Correção: distinguir "não carregou" de "vazio".

- [SEVERIDADE: baixo] `src/pages/AdminMembros.tsx:682-699` — Duplicatas só por primeiro+último nome normalizados; não detecta mesmo telefone/e-mail com nomes diferentes (ex.: "Rogerio" vs "Rogério Silva Jr."). — Correção: agrupar também por `lower(email)` e telefone só-dígitos.

- [SEVERIDADE: baixo] `src/pages/AdminMembros.tsx:320-387` — Exportação inclui apenas ativos, herda `total_completed`/`has_next_session` (bugs acima), e não tem coluna "Tem acesso". Sem paginação, também herda o truncamento de 1000 bookings. — Correção: adicionar coluna de acesso e opção "incluir encerrados".

- [SEVERIDADE: baixo] `supabase/functions/bulk-upsert-members-full/index.ts:54` — `full_name` é sempre sobrescrito na atualização (após `toTitleCase` do front, `AdminMembros.tsx:209`). — Impacto: correções manuais de nome são desfeitas ao reimportar. — Correção: não sobrescrever `full_name` quando o perfil já existe, ou só quando vazio.

---

## 3. Lógica

- [SEVERIDADE: alto] `supabase/functions/admin-merge-profiles/index.ts:198-233` — Move apenas `bookings` e `nps_responses.mentor_id` (204-207) e depois **deleta o perdedor** (232). Tabelas com FK `ON DELETE CASCADE` para `profiles` (`student_tools.liberty_id` — mig. `20260625194840:5`; `tool_applications.member_id` — `20260727151530:32`; presença em eventos — `20260827213401:65`; `liberty_id` em `20260701211407:4`; pontos, depoimentos, `session_tasks.validated_by`) são apagadas em cascata; a migração `20260819163100:66-83` mostra a lista correta de tabelas a mover. `moved` (175-179) não registra isso, então o undo não recupera. — Impacto: mesclar apaga ferramentas, aplicações, pontos e presenças do perfil removido. — Correção: reaproveitar a lista da migração no edge function e registrar tudo em `moved`.

- [SEVERIDADE: alto] `supabase/functions/admin-merge-profiles/index.ts:199-201,226-228,232` — Se `winner.email` é null e `loser.email` existe, `updates.email = loser.email` é aplicado em 227 **antes** de deletar o perdedor (232) → viola `profiles_email_unique_idx` (`lower(email)`) → `throw` → bookings já movidos (204-207), perdedor ainda existe, UI mostra erro. Esse caso **não** é bloqueado por `emailsDiffer` (124-125). — Correção: `UPDATE loser SET email = NULL` antes, ou deletar o perdedor antes do update do vencedor (o snapshot já está no log).

- [SEVERIDADE: alto] `src/pages/AdminMembroEditar.tsx:106-112` vs `supabase/functions/admin-update-user/index.ts:86-98` — O front envia `business_story`, `leaders_count`, `employees_count_num`; a whitelist do backend não os contém → **descartados silenciosamente**, resposta `success`. — Impacto: admin edita "História unificada do negócio", "Colaboradores (número)" e "Quantidade de líderes" e nada é salvo; o detalhe usa exatamente esses campos (`AdminMembroDetalhes.tsx:232,237,251`). — Correção: adicionar as colunas à whitelist e devolver `ignored_keys` na resposta para o front avisar.

- [SEVERIDADE: alto] `src/pages/AdminMembroDetalhes.tsx:152-158,294` — Se `maybeSingle()` retorna `null` (id inválido, perfil mesclado/excluído), `setProfile(null)` + `setLoading(false)`; a condição de render `loading || !profile` mostra **"Carregando…" para sempre**. — Correção: estado `notFound` com mensagem e botão voltar (como `AdminMembroEditar.tsx:148`).

- [SEVERIDADE: alto] `src/components/MemberSessionEditor.tsx:127-141` vs `src/pages/AdminMembros.tsx:602-614` — Dois fluxos de exclusão do mesmo booking no mesmo painel: o do editor **não pede confirmação** e não apaga `session_tasks`; o da página pede confirm mas ignora erros dos dois primeiros `delete` (605-606). — Impacto: exclusão acidental de sessão com um clique; tarefas órfãs ou falha de FK conforme a tabela. — Correção: um único handler com confirm e limpeza consistente (ou deixar o CASCADE do banco fazer o trabalho).

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:584-600,1191-1198` — "Excluir membro permanentemente" fica a um clique (ícone de lixeira) ao lado de editar/inativar, com `window.confirm` genérico. Apaga auth, bookings, tarefas, relatórios (`admin-delete-user:59-85`). — Correção: mover para o detalhe/menu "mais", exigir digitar o nome ou "EXCLUIR", e sugerir "Encerrar" como alternativa.

- [SEVERIDADE: médio] `src/pages/AdminMembroEditar.tsx:117-144` — Após salvar, não invalida `["admin-members"]`; `staleTime: 60_000` em `App.tsx:61`. — Impacto: voltar para a lista mostra nome/tier/datas antigos por até 1 min. — Correção: `queryClient.invalidateQueries({ queryKey: ["admin-members"] })` no sucesso.

- [SEVERIDADE: médio] `src/components/AdminMemberNote.tsx:18-20,37` — `useEffect` reseta `value` quando `initialNote` muda; cada save invalida toda a lista `admin-members` (refetch de todos os perfis, bookings e tarefas). Se o refetch de outra ação chega enquanto o admin digita, o texto é sobrescrito. — Correção: só sincronizar quando `!isDirty`; usar `setQueryData` pontual em vez de invalidar; debounce.

- [SEVERIDADE: médio] `src/pages/AdminMembroDetalhes.tsx:175-178,186,195` — Erros de `booking_reports`, `session_tasks`, `sessions` e `profiles` (mentores) são ignorados (destructuring com default `[]`). — Impacto: seção de tarefas/relatórios aparece vazia sem aviso; contador `realizedJourneyCount` distorcido (ver Cruzamento). — Correção: checar `error` e mostrar toast/estado de erro.

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:1519-1557` — Modal de relatório: enquanto a query carrega, `report` é `undefined` e cai no branch "Nenhum relatório encontrado para esta sessão". — Correção: usar `isLoading` do `useQuery`.

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:426-430,433` — `if (error) throw error` do `functions.invoke` produz "Edge Function returned a non-2xx status code" (não passa por `readFnError`/`translateErrorToPt`); toast de sucesso (430) omite `summary.errors`. — Correção: usar `readFnError` e incluir erros no toast.

- [SEVERIDADE: médio] `src/components/MemberTimeline.tsx:52-54,129-141,183` — `startDate`/`endDate` sempre têm default (hoje / +6 meses), logo `if (!startDate || !endDate)` (130) e `noDataYet` (183) nunca são verdadeiros; `paceInfo` exibe "Atrasado (-4)" com datas inventadas mesmo quando o placeholder (278-280) diz que as datas não estão definidas. — Correção: `paceInfo = hasProgramDates ? ... : null`.

- [SEVERIDADE: médio] `src/components/MemberTimeline.tsx:135-137` — `elapsedMonths` ignora o dia do mês: no dia 1 o esperado salta +2. — Correção: usar `differenceInMonths` ou o mesmo `monthCycles`.

- [SEVERIDADE: médio] `supabase/functions/admin-merge-profiles/index.ts:204-233` — Merge não é transacional; falha em qualquer passo deixa estado parcial (bookings movidos, perfis intactos). — Correção: mover a lógica para uma função SQL `security definer` com transação, chamada via RPC.

- [SEVERIDADE: baixo] `src/pages/AdminMembros.tsx:729-735` — Em resposta non-2xx o supabase-js retorna `data = null`, então `payload?.blocked` nunca é true; o tratamento real só acontece em 736-745. Código redundante e confuso. — Correção: remover 731-735.

- [SEVERIDADE: baixo] `src/pages/AdminMembros.tsx:228-235` — `?expand=<id>` expande a linha mas não faz scroll até ela nem valida se o id existe na aba atual (`tierTab` default "begin" — membro Liberty expandido fica invisível). — Correção: ao expandir por URL, setar `tierTab` pelo `member_tier` e `scrollIntoView`.

- [SEVERIDADE: baixo] `src/pages/AdminMembros.tsx:414` — Variável `members` local (linhas da planilha) faz shadow de `members` do hook (215). — Correção: renomear para `rows`.

- [SEVERIDADE: baixo] `src/pages/AdminMembros.tsx:357` — `ws["!freeze"]` não é recurso do SheetJS community (ignorado silenciosamente; por isso o `as any`). — Correção: remover.

- [SEVERIDADE: baixo] `src/pages/AdminMembroEditar.tsx:88-96` — Erro de RLS/rede e "não encontrado" viram a mesma tela "Membro não encontrado". — Correção: distinguir mensagens.

- [SEVERIDADE: baixo] `supabase/functions/create-user/index.ts:201` — `err.message` com `err` de tipo `unknown` (Deno strict); demais funções usam `(err as Error).message`. — Correção: padronizar.

- [SEVERIDADE: baixo] `supabase/functions/bulk-upsert-members-full/index.ts:33-38`, `bulk-import-members:26-33` — Senhas temporárias com `Math.random` (não criptográfico); `create-user`/`reset-and-invite` usam `crypto.getRandomValues`. — Correção: padronizar em um helper compartilhado.

---

## 4. UX/Consistência visual

- [SEVERIDADE: alto] `src/pages/AdminMembros.tsx:1072-1089` — `div role="button"` com `onKeyDown` de Enter/Espaço contendo botões e links interativos (1134-1204). Enter em um botão interno dispara o clique **e** o toggle de expansão do wrapper (o `stopPropagation` está só no `onClick`). Controles interativos aninhados violam WAI-ARIA. — Correção: tornar apenas o nome/área da esquerda o botão de expandir; ações fora do wrapper.

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:1134-1204` — Cinco ações apenas com ícone e tooltip por hover; em mobile o tooltip não existe, então são 5 ícones sem rótulo visível (aria-label ajuda leitor de tela, não o toque). Exclusão permanente e "gerar acesso" no mesmo cluster. — Correção: em `< lg`, agrupar em menu "⋯" com rótulos textuais; destacar ações destrutivas.

- [SEVERIDADE: médio] `src/components/MemberTimeline.tsx:313-350` — Slots de 20×20 px (`h-5 w-5`) como alvos de toque; abaixo do mínimo recomendado (44 px). Numeração "Sessão N" por ordem cronológica e não pela `order` da sessão: se a sessão 3 do catálogo foi feita antes da 2, o slot "2" mostra a sessão 3. — Correção: aumentar área de toque via padding; numerar por `sessions.order`.

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:913` / `AdminMembroEditar.tsx:173,213` / `AdminMembroDetalhes.tsx:103` / `MemberProfilePanel.tsx:68` — O mesmo tier aparece como "Liberty (premium)", "Liberty Premium", "Liberty". — Correção: um `tierLabel()` em `lib`.

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:1381-1384` — EmptyState "Nenhum membro neste período — Ajuste o filtro de mês" aparece também quando a causa é a busca, o chip de filtro ou a aba "Encerrados" vazia. — Correção: mensagem condicional por causa.

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:1216,1293-1297` vs `AdminMembroDetalhes.tsx:309` vs `MemberTimeline.tsx:297-300` — "✓ 12/12", "7 de 12 · Faltam 5 sessões", "Realizadas 7/12", "7/12 sessões alcançadas · 58%": quatro formatações para o mesmo dado, com regras de contagem diferentes (seção 2). — Correção: componente `JourneyProgress` único.

- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:1136-1147` (`Send`) vs `KeyRound` em 878/1478 — Ícone de "enviar" para uma ação que gera senha e copia texto; ícone de chave já é usado para o mesmo conceito em outros pontos. — Correção: usar `KeyRound` no botão.

- [SEVERIDADE: médio] `src/pages/AdminMembroEditar.tsx:178-185` — Campo "Nova senha" `type="text"` (senha visível), sem toggle, sem indicação de que só funciona se o membro já tem acesso. — Correção: `type="password"` com toggle e hint dependente de `user_id`.

- [SEVERIDADE: médio] `src/pages/AdminMembroEditar.tsx:197-222`, `AdminMembroDetalhes.tsx:685-702` — `<label>` sem `htmlFor` e inputs sem `id` → leitores de tela não associam. Sem `required`, sem validação de e-mail. — Correção: `id`/`htmlFor` ou `aria-labelledby`.

- [SEVERIDADE: médio] `src/pages/AdminMembroDetalhes.tsx:653-657`, `501-510` — Botões de seções recolhíveis sem `aria-expanded`/`aria-controls`. — Correção: adicionar atributos.

- [SEVERIDADE: baixo] `src/pages/AdminMembros.tsx:1252` — `AdminMemberNote` renderiza um `textarea` amarelo para **cada** linha da lista (N textareas, N saves por blur), quebrando o ritmo visual da tabela. — Correção: mostrar nota como texto e editar sob demanda (ícone), ou apenas no painel expandido.

- [SEVERIDADE: baixo] `src/components/AdminMemberNote.tsx:49-56` — `rows={1}` + `resize-none`: notas longas ficam cortadas; sem `aria-label` (só placeholder); sem atalho de salvar. — Correção: auto-grow, `aria-label="Observação do administrador"`, salvar com Cmd/Ctrl+Enter.

- [SEVERIDADE: baixo] `src/pages/AdminMembros.tsx:1323-1330` — Botão de remover sessão `lg:opacity-0` até hover; descoberta baixa em desktop. — Correção: ícone sempre visível com baixa opacidade.

- [SEVERIDADE: baixo] `src/pages/AdminMembros.tsx:1616` — "Nenhuma duplicata detectada 🎉" — emoji em UI administrativa, fora do tom do restante. — Correção: remover.

- [SEVERIDADE: baixo] `src/pages/AdminMembros.tsx:1237` — "de 2" hard-coded ao lado da meta; a meta "2 sessões/mês" também está hard-coded em 934, `MemberTimeline.tsx:219` e `sessionProgress`. — Correção: constante `SESSIONS_PER_MONTH`.

- [SEVERIDADE: baixo] `src/pages/AdminMembros.tsx:1096` — Avatar 36 px com `initials()`; `AdminMembroDetalhes.tsx:300` usa `AvatarLightbox` 56 px; `AdminMembroEditar.tsx:163-168` usa `AvatarUpload` sem `size`. Três componentes de avatar. — Correção: um `MemberAvatar` com `size`.

- [SEVERIDADE: baixo] Textos em inglês que podem chegar à UI: `create-user:194-196` ("User created with role…", "Profile-only created…"), `reset-and-invite:38,47` ("profile_id or user_id required", "Profile not found"), todos os "Missing authorization"/"Invalid token"/"Not authorized" (só `unauthor`/`permission` são traduzidos em `AdminMembros.tsx:252-255`); `Login.tsx:41,53` exibe `error.message` cru do GoTrue. — Correção: mensagens PT no backend + mapa de tradução central.

---

## 5. Qualidade

### `AdminMembros.tsx` (1714 linhas) — o que extrair

- [SEVERIDADE: alto] `src/pages/AdminMembros.tsx:54-212` — ~160 linhas de template, aliases e parsing de planilha (`FULL_TEMPLATE_COLUMNS`, `FIELD_ALIASES`, `matchHeaderToField`, `parseImportDate`, `cleanImportedValue`) dentro da página. — Correção: `src/lib/memberImport.ts` (puro, testável).
- [SEVERIDADE: alto] `src/pages/AdminMembros.tsx:1064-1378` — Render de linha + painel expandido (~315 linhas) inline no `.map`. — Correção: `components/admin/members/MemberRow.tsx` e `MemberExpandedPanel.tsx`.
- [SEVERIDADE: médio] `245-281` + `543-555` — `translateErrorToPt`/`readFnError` redefinidos a cada render e duplicados inline em `handleSave`. — Correção: `src/lib/edgeFunctionErrors.ts`, usado também em `AdminMembroEditar.tsx:127-138`.
- [SEVERIDADE: médio] `292-387` — Templates e exportação XLSX. — Correção: `src/lib/memberExport.ts`.
- [SEVERIDADE: médio] `498-673` — `handleSave/Delete/Invite/ToggleActive` + estados. — Correção: `hooks/useMemberActions.ts` com `useMutation` (invalidação centralizada).
- [SEVERIDADE: médio] `674-780` + `1561-1708` — Detecção de duplicatas, merge, undo e dois diálogos. — Correção: `DuplicateProfilesDialog.tsx` + `useProfileMerge.ts`.
- [SEVERIDADE: médio] `850-921` + `1391-1421` — Formulário e os dois `Dialog`s (add/edit) idênticos. — Correção: `MemberFormDialog.tsx` com prop `mode`.
- [SEVERIDADE: médio] `1423-1516` — Diálogo de importação. — Correção: `ImportMembersDialog.tsx`.
- [SEVERIDADE: baixo] `463-476` + `1518-1557` — Modal de relatório. — Correção: `BookingReportDialog.tsx` (reutilizável em `AdminSessoes`).

### Código morto

- [SEVERIDADE: médio] `src/components/MemberProfilePanel.tsx` — Componente inteiro (122 linhas) sem nenhum uso no `src`. Ainda tem imports no fim do arquivo (120-122), violando a regra de imports no topo, e `formatMoney` (56-60) faz `parseFloat("80.000")` → "R$ 80". — Correção: remover.
- [SEVERIDADE: médio] `supabase/functions/bulk-import-members/index.ts` — Não invocada por nenhum código do front. — Correção: remover (e de `config.toml:15`).
- [SEVERIDADE: baixo] `src/pages/AdminMembroDetalhes.tsx:765-780` (`StatCard`), `127,135` (`cancelledBookings`, `showCancelled` nunca renderizados), import `XCircle` (6). — Correção: remover.
- [SEVERIDADE: baixo] `src/pages/AdminMembroEditar.tsx:114-115` (`emailChanged` e `profile.email_original`, coluna inexistente), imports `Link` (2) e `navigate` (79) não usados. — Correção: remover.
- [SEVERIDADE: baixo] `src/pages/AdminMembros.tsx:11` (`Copy` não usado), `46-52` (`ImportResult.status "skipped"` — `bulk-upsert-members-full` nunca retorna `skipped`; só a função morta), `1473`. — Correção: remover.
- [SEVERIDADE: baixo] `src/components/MemberTimeline.tsx:79` (`completedCount`), `183` (`noDataYet`). — Correção: remover ou usar.
- [SEVERIDADE: baixo] `supabase/functions/admin-merge-profiles/index.ts:216-223,237` — Branch inalcançável e `auth_kept` sempre false. — Correção: remover.

### Tipagem (`any`) e TS relaxado

- [SEVERIDADE: médio] `tsconfig.app.json:25` `strict: false`, `tsconfig.json:13` `strictNullChecks: false` — Toda a auditoria acima teria vários alertas de compilador com strict ligado. — Correção: habilitar gradualmente, começando por `strictNullChecks`.
- [SEVERIDADE: médio] `src/pages/AdminMembros.tsx:231,357,484,577,596,611,618,638,646,660,669,678,716,730,738,752,776,1013,1627` — 19 usos de `any` (handlers recebem `member: any` apesar de existir `MemberWithProgress`). — Correção: tipar com `MemberWithProgress`, `ProfileMergeLog`, `EdgeFnError`.
- [SEVERIDADE: médio] `src/pages/AdminMembroDetalhes.tsx:34,126-131,137,250,263,317,597`, `AdminMembroEditar.tsx:11,98`, `MemberTimeline.tsx:21,25,59`, `MemberProfilePanel.tsx:8,11` — `Record<string, any>`/`any` para perfis, tarefas e relatórios; existe `Tables<"profiles">` em `integrations/supabase/types.ts`. — Correção: usar os tipos gerados.
- [SEVERIDADE: baixo] `src/pages/AdminMembros.tsx:222,224,1013` — Estados `filter`/`tierTab` sem `switch` exaustivo; chips definidos em array de objetos sem tipo literal (`f.key as any`). — Correção: `as const satisfies { key: FilterKey; … }[]`.

### Duplicação e consistência interna

- [SEVERIDADE: médio] `AdminMembros.tsx:84-89` (`SECTIONS` implícita em `FULL_TEMPLATE_COLUMNS`), `AdminMembroDetalhes.tsx:36-91`, `AdminMembroEditar.tsx:13-75`, `admin-update-user:86-98`, `bulk-upsert-members-full:23-31`, `admin-merge-profiles:25-33` — Seis listas de campos de perfil mantidas à mão e já divergentes (whitelist do backend sem `business_story`/`leaders_count`/`employees_count_num`; `MERGEABLE` com `google_calendar_email` que a whitelist não aceita). — Correção: um único `profileFields.ts` compartilhado (`supabase/functions/_shared/` + `src/lib/`).
- [SEVERIDADE: baixo] Cabeçalho de autenticação/autorização copiado em todas as 10 edge functions (~35 linhas cada). — Correção: `_shared/requireAdmin.ts`.
- [SEVERIDADE: baixo] `src/pages/AdminMembroDetalhes.tsx:395-553,555-607` — Dois IIFEs de ~150 e ~50 linhas dentro do JSX. — Correção: `MemberTasksPanel.tsx` e `MemberResultsTimeline.tsx`.

---

### Ordem sugerida de correção (impacto × esforço)

1. Rodar as queries 3/4/5 para Emerson e Rogério e usar "Gerar acesso" (ou query 12) — desbloqueio imediato.
2. `admin-update-user` e `bulk-upsert-members-full`: criar/vincular auth quando `user_id` é null; expor `user_id`/badge "Sem acesso" em `useMembers` + lista + detalhe.
3. Corrigir textos "Liberty@2026"/"senha padrão" e mostrar senha do `create-user` no `AccessCredentialsDialog`.
4. `Login.tsx`: traduzir erros reais do GoTrue e tratar `roles.length === 0`.
5. `admin-merge-profiles`: ordem de e-mail/delete e mover todas as tabelas dependentes.
6. Whitelist do `admin-update-user`; paginação de `bookings` em `useMembers`; unificar regra de contagem via `buildSessionProgress`.
7. Refatoração de `AdminMembros.tsx` conforme a lista de extração.