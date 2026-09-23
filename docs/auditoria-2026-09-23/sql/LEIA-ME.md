# Como rodar os scripts (passo a passo, sem precisar saber SQL)

Os scripts desta pasta corrigem os casos dos prints (Kaoru, Alexandre, Esequiel, Emerson, Rogério).
Eles são "auto-localizáveis": você não precisa copiar nenhum ID. Cada script confere sozinho se
encontrou exatamente o registro certo; se não encontrar (ou encontrar mais de um), ele **para sem
alterar nada** e mostra uma mensagem explicando.

## 1. Abrir o editor de SQL do Supabase

1. Entre em <https://supabase.com/dashboard> com a conta que administra a plataforma.
2. Clique no projeto **roddclbsxqrlgmxvjsqr** (o projeto da Liberty Begin).
3. No menu da esquerda, clique no ícone **SQL Editor** (ícone de folha com `>_`, quase no meio do menu).
4. Clique em **+ New query** (canto superior esquerdo).
5. Abra o arquivo `.sql` desta pasta no computador, copie **todo** o conteúdo e cole na área de texto.
6. Clique em **Run** (ou `Cmd + Enter`).
7. O resultado aparece embaixo. Se o script for de correção, a mensagem de sucesso aparece na aba **Results**
   (ou em **Messages/Notices**, dependendo da versão do painel).

Ordem sugerida: primeiro os `01` e `02` (só leitura, não alteram nada). Me mande um print do resultado
de cada um. Depois rode as correções `03` a `06` na ordem.

## 2. Arquivos

| Arquivo | O que faz | Altera dados? |
|---|---|---|
| `01-diagnostico-sessoes.sql` | Lista todas as sessões de Kaoru, Alexandre Ribeiro e Esequiel com status, relatório, mentor | Não |
| `02-diagnostico-acesso.sql` | Cruza perfil x conta de login x papel de Emerson e Rogério e diz a situação de cada um | Não |
| `03-corrigir-kaoru.sql` | Cancela a sessão "Vendas" de 17/09 (Djeniffer). O Mapeamento (19/09, Rinaldo) vira a sessão 01 e "Vendas" volta a pendente | Sim |
| `04-corrigir-alexandre.sql` | Cancela o "Mapeamento do Negócio" agendado indevidamente (sessão 10) e libera o horário do mentor | Sim |
| `05-corrigir-esequiel.sql` | Marca "SWOT/Tecnologia" e "Marketing de Tração" do Esequiel como realizadas (só se as sessões já estiverem cadastradas e no passado) | Sim |
| `06-vincular-acesso.sql` | Se o `02` mostrar "AUTH EXISTE MAS PROFILE NÃO VINCULADO", este vincula o perfil à conta de login e garante o papel `liberty` | Sim |

## 3. O que fazer com o resultado do `02` (Emerson e Rogério)

A coluna `situacao` diz o caminho:

- **PROFILE SEM AUTH** → o membro existe no painel mas **nunca teve conta de login**. Por isso o
  "esqueci a senha" não chega (não há para quem enviar). Correção pelo painel: Admin → Membros →
  abrir o membro → **Gerar acesso** (ou "Redefinir e convidar"). Copie a senha gerada e envie por WhatsApp.
- **AUTH EXISTE MAS PROFILE NÃO VINCULADO** → rode o `06-vincular-acesso.sql`.
- **PROFILE VINCULADO A OUTRO AUTH** ou dois perfis com o mesmo e-mail → me mande o print; precisa de fusão manual.
- **OK** mas `email_confirmed_at` vazio ou `banned_until` preenchido → me mande o print.
- **OK** e tudo preenchido → a senha está errada mesmo. Use **Gerar acesso** para uma senha nova e envie por WhatsApp.

## 4. Por que o e-mail de "esqueci a senha" não chega (independente do caso)

O projeto usa o serviço de e-mail padrão do Supabase, que é limitado (poucas mensagens por hora e cai
em spam). Para funcionar de forma confiável:

1. Dashboard → **Authentication** → **Emails** (ou **SMTP Settings**) → ativar **Custom SMTP** com um
   provedor (Resend, Brevo, Postmark, Gmail Workspace). Preencher host, porta, usuário, senha e o
   e-mail remetente (ex.: `acesso@libertybegin.com.br`).
2. Dashboard → **Authentication** → **URL Configuration** → conferir se **Site URL** é o endereço real
   da plataforma (https) e se a lista **Redirect URLs** contém `https://SEU-DOMINIO/reset-password`
   e `https://SEU-DOMINIO/**`.
3. Depois disso, testar "Esqueci minha senha" com o seu próprio e-mail.

Enquanto o SMTP não estiver configurado, o caminho seguro é sempre **Gerar acesso** no painel e mandar
a senha por WhatsApp.
