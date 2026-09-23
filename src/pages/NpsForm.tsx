import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState, PageContainer, PageHeader, SectionCard, SelectField, TextAreaField } from "@/components/ds";

type Booking = {
  id: string;
  liberty_id: string | null;
  mentor_id: string | null;
  session_id: string | null;
  scheduled_date: string | null;
};

const scoreQuestions: { key: keyof ScoreState; label: string }[] = [
  { key: "score_overall", label: "1. De 0 a 10, como você avalia a sessão de hoje?" },
  { key: "score_content", label: "2. De 0 a 10, quanto o conteúdo da sessão foi claro e prático?" },
  { key: "score_mentor", label: "3. De 0 a 10, quanto o mentor foi objetivo, acolhedor e te ajudou a refletir?" },
  { key: "score_action_plan", label: "4. De 0 a 10, quanto você entendeu com clareza qual é o seu plano de ação após essa sessão?" },
  { key: "score_tool", label: "5. De 0 a 10, quanto a ferramenta utilizada hoje contribuiu para o seu avanço?" },
];

interface ScoreState {
  score_overall: number | null;
  score_content: number | null;
  score_mentor: number | null;
  score_action_plan: number | null;
  score_tool: number | null;
}

const emptyScores: ScoreState = {
  score_overall: null,
  score_content: null,
  score_mentor: null,
  score_action_plan: null,
  score_tool: null,
};

const ScoreScale = ({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (n: number) => void;
}) => (
  <fieldset className="space-y-2 border-0 p-0 m-0 min-w-0">
    <legend id={id} className="text-sm font-medium text-foreground leading-snug">{label}</legend>
    <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={id}>
      {Array.from({ length: 11 }, (_, i) => i).map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={active}
            aria-label={`Nota ${n}`}
            className={`h-11 min-w-[44px] px-2 rounded-ds border text-sm font-semibold transition-colors duration-ds-1 ease-ds tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-foreground hover:bg-accent"
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  </fieldset>
);

const NpsForm = () => {
  const { bookingId } = useParams<{ bookingId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alreadySent, setAlreadySent] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);

  const [sessionsList, setSessionsList] = useState<{ id: string; name: string }[]>([]);
  const [mentorsList, setMentorsList] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [selectedMentorId, setSelectedMentorId] = useState<string>("");

  const [scores, setScores] = useState<ScoreState>(emptyScores);
  const [keyTakeaway, setKeyTakeaway] = useState("");
  const [improvements, setImprovements] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState("");

  useEffect(() => {
    (async () => {
      if (!profile?.id) return;
      setLoading(true);
      try {
        // Load all active sessions + all mentor options for the dropdowns
        const [{ data: sess, error: sessError }, { data: mentorOptions, error: mentorError }] = await Promise.all([
          supabase.from("sessions").select("id, name, order").eq("is_active", true).order("order"),
          (supabase.from("nps_mentor_options" as any) as any)
            .select("profile_id, full_name")
            .order("full_name"),
        ]);

        if (sessError) throw sessError;
        if (mentorError) throw mentorError;

        setSessionsList((sess || []) as any);
        setMentorsList(
          ((mentorOptions || []) as any[]).map((m) => ({
            id: m.profile_id,
            full_name: m.full_name,
          }))
        );

        if (bookingId) {
          const { data: b } = await supabase
            .from("bookings")
            .select("id, liberty_id, mentor_id, session_id, scheduled_date")
            .eq("id", bookingId)
            .maybeSingle();
          if (b) {
            setBooking(b as Booking);
            setSelectedSessionId(b.session_id || "");
            setSelectedMentorId(b.mentor_id || "");
            const { data: existing } = await supabase
              .from("nps_responses")
              .select("id")
              .eq("booking_id", b.id)
              .eq("liberty_id", profile.id)
              .maybeSingle();
            setAlreadySent(!!existing);
          }
        }
      } catch (e: any) {
        toast.error("Não foi possível carregar as sessões e mentores. Atualize a página e tente novamente.");
      } finally {
        setLoading(false);
      }
    })();
  }, [bookingId, profile?.id]);

  const missingScores = scoreQuestions.some((q) => scores[q.key] == null);

  const submit = async () => {
    if (!profile?.id) return;
    if (!selectedSessionId) {
      toast.error("Selecione qual sessão você está avaliando.");
      return;
    }
    if (!selectedMentorId) {
      toast.error("Selecione qual mentor conduziu a sessão.");
      return;
    }
    if (missingScores) {
      toast.error("Por favor responda todas as notas de 0 a 10.");
      return;
    }
    const sessionName = sessionsList.find((s) => s.id === selectedSessionId)?.name || null;
    const mentorName = mentorsList.find((m) => m.id === selectedMentorId)?.full_name || null;

    setSubmitting(true);
    try {
      const { error } = await supabase.from("nps_responses").insert({
        liberty_id: profile.id,
        mentor_id: selectedMentorId,
        session_id: selectedSessionId,
        booking_id: booking?.id ?? null,
        liberty_name: profile.full_name ?? null,
        liberty_whatsapp: (profile as any)?.phone ?? null,
        session_name: sessionName,
        mentor_name: mentorName,
        ...scores,
        key_takeaway: keyTakeaway || null,
        improvements: improvements || null,
        would_recommend: wouldRecommend || null,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["pending-nps"] });
      toast.success("Avaliação registrada");
      navigate("/dashboard");
    } catch (e: any) {
      toast.error("Erro ao enviar: " + (e?.message || "desconhecido"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout role="liberty">
      <PageContainer variant="narrow">
        <PageHeader
          eyebrow="Pesquisa de satisfação"
          title="Como foi sua sessão?"
          description="Sua opinião nos ajuda a evoluir a experiência do Liberty Begin. Leva menos de 2 minutos."
          back
        />

        {loading ? (
          <LoadingState variant="cards" rows={3} />
        ) : alreadySent ? (
          <SectionCard className="text-center space-y-2">
            <CheckCircle2 className="h-6 w-6 text-muted-foreground mx-auto" aria-hidden />
            <p className="text-[17px] font-semibold text-foreground">Você já respondeu essa avaliação</p>
            <p className="text-sm text-muted-foreground">Obrigado pelo feedback.</p>
            <div className="pt-2">
              <Button variant="outline" onClick={() => navigate("/dashboard")}>Voltar ao início</Button>
            </div>
          </SectionCard>
        ) : (
          <form
            className="space-y-6 pb-24 sm:pb-0"
            onSubmit={(e) => { e.preventDefault(); submit(); }}
          >
            <SectionCard className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                  label="Qual sessão você realizou?"
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                >
                  <option value="">Selecione a sessão</option>
                  {sessionsList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </SelectField>
                <SelectField
                  label="Quem foi seu mentor?"
                  value={selectedMentorId}
                  onChange={(e) => setSelectedMentorId(e.target.value)}
                >
                  <option value="">Selecione o mentor</option>
                  {mentorsList.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </SelectField>
              </div>

              {scoreQuestions.map((q) => (
                <ScoreScale
                  key={q.key}
                  id={`nps-${q.key}`}
                  label={q.label}
                  value={scores[q.key]}
                  onChange={(n) => setScores((s) => ({ ...s, [q.key]: n }))}
                />
              ))}

              <TextAreaField
                label="6. Qual foi a maior chave que você pegou na sessão de hoje?"
                value={keyTakeaway}
                onChange={(e) => setKeyTakeaway(e.target.value)}
                rows={3}
                placeholder="Escreva aqui"
              />

              <TextAreaField
                label="7. Tem algo que você acredita que poderia ser melhorado? Suas sugestões:"
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
                rows={3}
                placeholder="Escreva aqui"
              />

              <TextAreaField
                label="8. Você indicaria essa mentoria para outra pessoa que deseja prosperar?"
                value={wouldRecommend}
                onChange={(e) => setWouldRecommend(e.target.value)}
                rows={2}
                placeholder="Sim ou não, e por quê"
              />
            </SectionCard>

            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] sm:static sm:border-0 sm:bg-transparent sm:p-0">
              <div className="mx-auto flex max-w-2xl flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" size="lg" onClick={() => navigate(-1)}>
                  Voltar
                </Button>
                <Button type="submit" size="lg" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                  Enviar avaliação
                </Button>
              </div>
            </div>
          </form>
        )}
      </PageContainer>
    </AppLayout>
  );
};

export default NpsForm;
