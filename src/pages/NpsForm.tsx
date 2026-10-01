import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { EmptyState, ListRow, LoadingState, PageContainer, PageHeader, SectionCard, StatusPill, TextAreaField } from "@/components/ds";
import { sortByScheduledDateDesc } from "@/lib/bookingStatus";
import { isNpsEligibleBooking } from "@/lib/pendingNps";

type Booking = {
  id: string;
  liberty_id: string | null;
  mentor_id: string | null;
  session_id: string | null;
  scheduled_date: string | null;
  status: string | null;
  is_retroactive: boolean | null;
  report_required: boolean | null;
  start_time: string | null;
  end_time: string | null;
  sessions: { name: string | null; order: number | null } | null;
  mentor: { full_name: string | null } | null;
};

type PendingItem = {
  id: string;
  scheduled_date: string;
  session_name: string;
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
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  const [scores, setScores] = useState<ScoreState>(emptyScores);
  const [keyTakeaway, setKeyTakeaway] = useState("");
  const [improvements, setImprovements] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState("");

  useEffect(() => {
    (async () => {
      if (!profile?.id) return;
      setLoading(true);
      setBlockedReason(null);
      setAlreadySent(false);
      setBooking(null);
      try {
        const [bookingsResult, answeredResult] = await Promise.all([
          supabase
            .from("bookings")
            .select("id, liberty_id, mentor_id, session_id, scheduled_date, status, is_retroactive, report_required, start_time, end_time, sessions(name, order), mentor:profiles!bookings_mentor_id_fkey(full_name)")
            .eq("liberty_id", profile.id)
            .eq("status", "completed")
            .order("scheduled_date", { ascending: false }),
          supabase.from("nps_responses").select("booking_id").eq("liberty_id", profile.id),
        ]);
        if (bookingsResult.error) throw bookingsResult.error;
        if (answeredResult.error) throw answeredResult.error;

        const answered = new Set((answeredResult.data ?? []).map((r) => r.booking_id).filter(Boolean) as string[]);
        const mine = (bookingsResult.data ?? []) as unknown as Booking[];
        const open = sortByScheduledDateDesc(mine.filter((b) => isNpsEligibleBooking(b, answered)));
        setPending(open.map((b) => ({
          id: b.id,
          scheduled_date: b.scheduled_date || "",
          session_name: b.sessions?.name || "Sessão",
        })));

        if (!bookingId) return;

        const current = mine.find((b) => b.id === bookingId) ?? null;
        if (!current) {
          setBlockedReason("Esta sessão não está na sua jornada.");
          return;
        }
        if (answered.has(current.id)) {
          setBooking(current);
          setAlreadySent(true);
          return;
        }
        if (!isNpsEligibleBooking(current, answered)) {
          setBlockedReason("Esta sessão ainda não pode ser avaliada.");
          return;
        }
        setBooking(current);
      } catch {
        toast.error("Não foi possível carregar suas sessões. Atualize a página e tente novamente.");
      } finally {
        setLoading(false);
      }
    })();
  }, [bookingId, profile?.id]);

  const missingScores = scoreQuestions.some((q) => scores[q.key] == null);

  const submit = async () => {
    if (!profile?.id || !booking?.session_id || !booking.mentor_id) return;
    if (missingScores) {
      toast.error("Por favor responda todas as notas de 0 a 10.");
      return;
    }
    const sessionName = booking.sessions?.name || null;
    const mentorName = booking.mentor?.full_name || null;

    setSubmitting(true);
    try {
      const { error } = await supabase.from("nps_responses").insert({
        liberty_id: profile.id,
        mentor_id: booking.mentor_id,
        session_id: booking.session_id,
        booking_id: booking.id,
        liberty_name: profile.full_name ?? null,
        liberty_whatsapp: (profile as { phone?: string | null }).phone ?? null,
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
      navigate("/nps");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "desconhecido";
      toast.error("Erro ao enviar: " + message);
    } finally {
      setSubmitting(false);
    }
  };

  const sessionLabel = booking?.sessions?.name || "Sessão";
  const mentorLabel = booking?.mentor?.full_name || "Mentor não informado";
  const dateLabel = booking?.scheduled_date
    ? format(parseISO(booking.scheduled_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : null;

  return (
    <AppLayout role="liberty">
      <PageContainer variant="narrow">
        <PageHeader
          eyebrow="Pesquisa de satisfação"
          title={bookingId ? "Como foi sua sessão?" : "Sessões para avaliar"}
          description={
            bookingId
              ? "A nota fica ligada a esta sessão. Leva menos de 2 minutos."
              : "Escolha a sessão que você ainda não avaliou."
          }
          back={bookingId ? "/nps" : "/dashboard"}
        />

        {loading ? (
          <LoadingState variant="list" rows={3} />
        ) : !bookingId ? (
          pending.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nenhuma sessão para avaliar"
              description="Quando uma sessão sua for marcada como realizada, ela aparece aqui."
            />
          ) : (
            <SectionCard padding="none">
              {pending.map((item, index) => (
                <ListRow
                  key={item.id}
                  last={index === pending.length - 1}
                  onPress={() => navigate(`/nps/${item.id}`)}
                  title={item.session_name}
                  subtitle={item.scheduled_date ? format(parseISO(item.scheduled_date), "dd 'de' MMMM", { locale: ptBR }) : "Data não informada"}
                  trailing={<StatusPill tone="pending" withDot={false}>Sem avaliação</StatusPill>}
                />
              ))}
            </SectionCard>
          )
        ) : alreadySent ? (
          <SectionCard className="text-center space-y-2">
            <CheckCircle2 className="h-6 w-6 text-muted-foreground mx-auto" aria-hidden />
            <p className="text-[17px] font-semibold text-foreground">Você já avaliou esta sessão</p>
            <p className="text-sm text-muted-foreground">{sessionLabel}</p>
            <div className="pt-2">
              <Button variant="outline" onClick={() => navigate("/nps")}>Ver outras sessões</Button>
            </div>
          </SectionCard>
        ) : blockedReason || !booking ? (
          <EmptyState
            title="Não dá para avaliar esta sessão"
            description={blockedReason || "Esta sessão não está na sua jornada."}
            action={<Button variant="outline" onClick={() => navigate("/nps")}>Ver suas sessões</Button>}
          />
        ) : (
          <form
            className="space-y-6 pb-24 sm:pb-0"
            onSubmit={(e) => { e.preventDefault(); submit(); }}
          >
            <SectionCard className="space-y-6">
              <dl className="grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Sessão</dt>
                  <dd className="text-sm font-medium text-foreground mt-1">{sessionLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Mentor</dt>
                  <dd className="text-sm font-medium text-foreground mt-1">{mentorLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Data</dt>
                  <dd className="text-sm font-medium text-foreground mt-1">{dateLabel || "Sem data"}</dd>
                </div>
              </dl>

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
                <Button type="button" variant="outline" size="lg" onClick={() => navigate("/nps")}>
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
