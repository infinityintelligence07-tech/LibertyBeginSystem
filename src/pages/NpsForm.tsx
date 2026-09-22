import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, Loader2, Send } from "lucide-react";

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
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) => (
  <div className="flex flex-wrap gap-1.5">
    {Array.from({ length: 11 }, (_, i) => i).map((n) => {
      const active = value === n;
      return (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-9 min-w-9 px-2 rounded-lg border text-sm font-semibold transition-colors tabular-nums ${
            active
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border text-foreground hover:border-primary/40 hover:bg-muted"
          }`}
        >
          {n}
        </button>
      );
    })}
  </div>
);

const NpsForm = () => {
  const { bookingId } = useParams<{ bookingId?: string }>();
  const navigate = useNavigate();
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
      toast.success("Obrigado! Sua avaliação foi registrada.");
      navigate("/dashboard");
    } catch (e: any) {
      toast.error("Erro ao enviar: " + (e?.message || "desconhecido"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout role="liberty">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <ClipboardCheck className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Pesquisa de Satisfação</span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Como foi sua sessão?</h1>
          <p className="text-sm text-muted-foreground">
            Sua opinião nos ajuda a evoluir a experiência do Liberty Begin. Leva menos de 2 minutos.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : alreadySent ? (
          <div className="rounded-2xl border border-status-green/30 bg-status-green/5 p-6 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-status-green mx-auto" />
            <p className="text-sm font-semibold text-foreground">Você já respondeu essa avaliação.</p>
            <p className="text-xs text-muted-foreground">Obrigado pelo feedback!</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card/80 p-5 md:p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Qual sessão você realizou?
                </label>
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Selecione a sessão…</option>
                  {sessionsList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Quem foi seu mentor?
                </label>
                <select
                  value={selectedMentorId}
                  onChange={(e) => setSelectedMentorId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Selecione o mentor…</option>
                  {mentorsList.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>
            </div>

            {scoreQuestions.map((q) => (
              <div key={q.key} className="space-y-2">
                <label className="text-sm font-medium text-foreground">{q.label}</label>
                <ScoreScale
                  value={scores[q.key]}
                  onChange={(n) => setScores((s) => ({ ...s, [q.key]: n }))}
                />
              </div>
            ))}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                6. Qual foi a maior chave que você pegou na sessão de hoje?
              </label>
              <textarea
                value={keyTakeaway}
                onChange={(e) => setKeyTakeaway(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Escreva aqui…"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                7. Tem algo que você acredita que poderia ser melhorado? Suas sugestões:
              </label>
              <textarea
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Escreva aqui…"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                8. Você indicaria essa mentoria para outra pessoa que deseja prosperar?
              </label>
              <textarea
                value={wouldRecommend}
                onChange={(e) => setWouldRecommend(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Sim / Não e por quê…"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => navigate(-1)}
                className="px-4 py-2 rounded-xl border border-border text-sm text-foreground hover:bg-muted transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar avaliação
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default NpsForm;
