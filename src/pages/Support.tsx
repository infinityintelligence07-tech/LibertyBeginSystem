import { useState } from "react";
import { SUPPORT_WHATSAPP_URL } from "@/lib/authErrors";
import { AppLayout } from "@/components/AppLayout";
import { MessageCircle, Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, SectionCard, SectionHeader } from "@/components/ds";

const faqs = [
  { q: "Como faço para agendar uma sessão?", a: "Acesse 'Agenda' no menu e toque em 'Agendar sessão'. Escolha a sessão, o mentor e o horário disponível." },
  { q: "Posso remarcar uma sessão?", a: "Sim, você pode remarcar até 24h antes da sessão. Acesse sua agenda e toque em 'Remarcar'." },
  { q: "Com que frequência devo agendar?", a: "Recomendamos 2 sessões por mês para concluir a jornada em 6 meses." },
  { q: "O que acontece se eu perder uma sessão?", a: "A sessão será marcada como não realizada. Entre em contato com o nosso suporte para reagendar." },
  { q: "Como acesso o Zoom?", a: "O link do Zoom é enviado por e-mail e aparece no card da sessão agendada no início." },
];

const SupportPage = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <AppLayout role="liberty">
      <PageContainer variant="narrow">
        <div className="space-y-6 lg:space-y-8">
          <PageHeader
            title="Suporte"
            description="Tire dúvidas sobre agendamento, acesso e direcionamento."
          />

          <SectionCard className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <MessageCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0 space-y-1">
                <p className="text-[17px] font-semibold text-foreground">Fale com o nosso suporte</p>
                <p className="text-sm text-muted-foreground">Atendimento pelo WhatsApp, com a equipe Liberty.</p>
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  Segunda a sexta, 9h às 18h
                </p>
              </div>
            </div>
            <Button size="lg" asChild className="w-full sm:w-auto shrink-0">
              <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden />
                Abrir WhatsApp
              </a>
            </Button>
          </SectionCard>

          <section className="space-y-3" aria-labelledby="faq-title">
            <SectionHeader title={<span id="faq-title">Perguntas frequentes</span>} />
            <SectionCard padding="none">
              {faqs.map((faq, i) => {
                const isOpen = openFaq === i;
                const panelId = `faq-panel-${i}`;
                return (
                  <div key={faq.q} className={cn(i < faqs.length - 1 && "border-b border-border")}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      className="w-full min-h-14 px-4 py-3 flex items-center justify-between gap-3 text-left text-sm font-medium text-foreground transition-colors duration-ds-1 hover:bg-accent/60 focus-visible:outline-none focus-visible:bg-accent/60"
                    >
                      <span>{faq.q}</span>
                      <ChevronDown
                        className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-ds-2", isOpen && "rotate-180")}
                        aria-hidden
                      />
                    </button>
                    {isOpen && (
                      <div id={panelId} className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </SectionCard>
          </section>
        </div>
      </PageContainer>
    </AppLayout>
  );
};

export default SupportPage;
