import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { PageContainer, SectionCard } from "@/components/ds";

const CONTACT_EMAIL = "libertybegin@gmail.com";
const UPDATED_AT = "26 de setembro de 2026";

type Section = { title: string; body: ReactNode };

const LegalLayout = ({ title, sections }: { title: string; sections: Section[] }) => (
  <div className="min-h-[100dvh] bg-background py-10">
    <PageContainer variant="narrow">
      <SectionCard className="space-y-6">
        <Logo size="md" />
        <div className="space-y-1">
          <h1 className="text-[24px] md:text-[28px] font-semibold leading-[1.2] tracking-[var(--ds-tracking-display)] text-foreground">
            {title}
          </h1>
          <p className="text-xs text-muted-foreground">Liberty Begin · Atualizado em {UPDATED_AT}</p>
        </div>
        {sections.map((s) => (
          <section key={s.title} className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">{s.title}</h2>
            <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{s.body}</div>
          </section>
        ))}
        <p className="text-sm text-muted-foreground">
          Dúvidas: <a className="underline text-foreground" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <div className="flex gap-4 text-sm">
          <Link className="underline text-foreground" to="/termos">Termos de uso</Link>
          <Link className="underline text-foreground" to="/privacidade">Política de privacidade</Link>
          <Link className="underline text-foreground" to="/">Entrar</Link>
        </div>
      </SectionCard>
    </PageContainer>
  </div>
);

export const TermsPage = () => (
  <LegalLayout
    title="Termos de uso"
    sections={[
      {
        title: "1. Sobre a plataforma",
        body: <p>A Liberty Begin é a plataforma de mentoria da Liberty Mentoria, usada por alunos, mentores e administradores para agendar sessões, realizar reuniões on-line, registrar relatórios e acompanhar a jornada do aluno.</p>,
      },
      {
        title: "2. Acesso",
        body: <p>O acesso é restrito a pessoas cadastradas pela Liberty Mentoria. Cada usuário é responsável por manter a senha em sigilo e pelas ações feitas com a própria conta.</p>,
      },
      {
        title: "3. Uso permitido",
        body: <p>A plataforma deve ser usada apenas para as atividades da mentoria. Não é permitido compartilhar o acesso, copiar conteúdos exclusivos, gravar ou divulgar sessões sem autorização, nem tentar burlar a segurança do sistema.</p>,
      },
      {
        title: "4. Sessões e reuniões",
        body: <p>As sessões podem acontecer no Google Meet, com salas criadas pela plataforma. Com o consentimento dos participantes, a reunião pode gerar anotações e transcrição automáticas, usadas para montar o relatório da sessão.</p>,
      },
      {
        title: "5. Conteúdo",
        body: <p>Materiais, ferramentas e conteúdos da plataforma pertencem à Liberty Mentoria. Informações enviadas pelo aluno continuam sendo dele e são usadas apenas para a mentoria.</p>,
      },
      {
        title: "6. Suspensão",
        body: <p>A Liberty Mentoria pode suspender ou encerrar o acesso de quem descumprir estes termos ou ao fim do contrato de mentoria.</p>,
      },
      {
        title: "7. Alterações",
        body: <p>Estes termos podem ser atualizados. A versão vigente fica sempre publicada nesta página.</p>,
      },
    ]}
  />
);

export const PrivacyPage = () => (
  <LegalLayout
    title="Política de privacidade"
    sections={[
      {
        title: "1. Dados que coletamos",
        body: <p>Nome, e-mail, telefone, foto de perfil, dados do negócio informados no cadastro, agendamentos, relatórios de sessão, tarefas e respostas de pesquisas (NPS).</p>,
      },
      {
        title: "2. Como usamos",
        body: <p>Para operar a mentoria: agendar e lembrar sessões, criar salas de reunião, gerar relatórios, acompanhar a evolução do aluno e comunicar avisos importantes. Não vendemos dados pessoais.</p>,
      },
      {
        title: "3. Dados do Google",
        body: (
          <>
            <p>Quando uma conta Google é conectada, a plataforma acessa apenas o necessário para: criar e atualizar eventos no Google Agenda, criar salas no Google Meet, configurar a sala (acesso, anotações e transcrição) e, após a reunião, ler a transcrição e o link das anotações da sessão para montar o relatório.</p>
            <p>Esses dados ficam guardados na plataforma vinculados à sessão, não são usados para publicidade, não são vendidos e não são compartilhados com terceiros fora da mentoria. O uso de informações recebidas das APIs do Google segue a <a className="underline text-foreground" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Política de Dados do Usuário dos Serviços de API do Google</a>, incluindo os requisitos de Uso Limitado.</p>
            <p>A conexão pode ser revogada a qualquer momento em <a className="underline text-foreground" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</p>
          </>
        ),
      },
      {
        title: "4. Compartilhamento",
        body: <p>Os dados são vistos apenas pela equipe da Liberty Mentoria (administradores) e pelo mentor responsável pelo aluno. Usamos provedores de infraestrutura (hospedagem, banco de dados e inteligência artificial para organizar relatórios) que processam dados apenas para prestar o serviço.</p>,
      },
      {
        title: "5. Segurança e retenção",
        body: <p>Os dados ficam em servidores com acesso controlado e conexão criptografada. Guardamos as informações durante a mentoria e pelo tempo necessário para obrigações legais.</p>,
      },
      {
        title: "6. Seus direitos (LGPD)",
        body: <p>Você pode pedir acesso, correção ou exclusão dos seus dados pelo e-mail abaixo.</p>,
      },
    ]}
  />
);
