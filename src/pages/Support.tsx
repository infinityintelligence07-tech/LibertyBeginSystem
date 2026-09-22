import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { MessageCircle, Clock, ChevronDown } from "lucide-react";
import { useState } from "react";

const faqs = [
  { q: "Como faço para agendar uma sessão?", a: "Acesse 'Agenda' no menu e clique em 'Agendar sessão'. Escolha a sessão, o mentor e o horário disponível." },
  { q: "Posso remarcar uma sessão?", a: "Sim, você pode remarcar até 24h antes da sessão. Acesse sua agenda e clique em 'Remarcar'." },
  { q: "Com que frequência devo agendar?", a: "Recomendamos 2 sessões por mês para concluir a jornada em 6 meses." },
  { q: "O que acontece se eu perder uma sessão?", a: "A sessão será marcada como 'no-show'. Entre em contato com o nosso suporte para reagendar." },
  { q: "Como acesso o Zoom?", a: "O link do Zoom é enviado por email e aparece no card da sessão agendada no dashboard." },
];

const SupportPage = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <AppLayout role="liberty">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-2xl mx-auto space-y-8"
      >
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-card border border-border mx-auto mb-4 flex items-center justify-center">
            <MessageCircle className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-semibold text-foreground mb-2">Suporte</h1>
          <p className="text-muted-foreground">
            Precisa de ajuda? Estamos aqui para você.
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            Tire dúvidas sobre agendamento, acesso e direcionamento.
          </p>
        </div>

        <a
          href="https://wa.me/5511999999999"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-silver w-full flex items-center justify-center gap-3 py-4 text-base"
        >
          <MessageCircle className="h-5 w-5" />
          Falar com o nosso suporte
        </a>

        <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Atendimento: Seg-Sex 9h-18h
        </div>

        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4">Perguntas frequentes</h2>
          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <div key={i} className="glass-card overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-4 text-left text-sm text-foreground hover:bg-accent/50 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="px-4 pb-4 text-sm text-muted-foreground"
                  >
                    {faq.a}
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </AppLayout>
  );
};

export default SupportPage;
