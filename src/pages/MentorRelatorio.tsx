import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useGoBack } from "@/lib/navigation";
import { AppLayout } from "@/components/AppLayout";
import {
  ExternalLink, AlertCircle, Wand2, Lock, Check, FileText,
  Building2, Target, Instagram, DollarSign, BookOpen, User, Loader2, Plus, X,
  ShieldCheck, Clock, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Callout,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  SectionHeader,
  SelectField,
  StatusPill,
  TextAreaField,
} from "@/components/ds";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { shortName } from "@/lib/formatName";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { bookingRequiresReport, getEffectiveBookingStatus, isBookingPast } from "@/lib/bookingStatus";
import { StudentTools } from "@/components/StudentTools";
import { SessionDeliverableDialog } from "@/components/SessionDeliverableDialog";
import {
  invalidateMentorBookingQueries,
  translateBookingError,
  useMentorBookingActions,
} from "@/components/mentor/MentorBookingActions";

type Suggestion = { id: string; text: string; approved: boolean };

const MentorRelatorioPage = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { hasRole, profile } = useAuth();
  // O layout segue a rota (/admin/... ou /mentor/...), não o papel do usuário
  const isAdminRoute = location.pathname.startsWith("/admin");
  const layoutRole: "admin" | "mentor" = isAdminRoute ? "admin" : "mentor";
  const goBack = useGoBack(isAdminRoute ? "/admin/membros" : "/mentor/sessoes");
  const { actingId, markCompleted } = useMentorBookingActions();

  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [delivered, setDelivered] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [aiAlert, setAiAlert] = useState("");
  const [aiStrategy, setAiStrategy] = useState("");
  const [impressions, setImpressions] = useState("");
  const [showImpressions, setShowImpressions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [organizing, setOrganizing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deliverableOpen, setDeliverableOpen] = useState(false);

  // Ao trocar de sessão na mesma tela (ex.: clique em notificação), zera o formulário
  // para o texto de um relatório não vazar para outro.
  useEffect(() => {
    setTranscript("");
    setSummary("");
    setDelivered("");
    setNextSteps("");
    setAiAlert("");
    setAiStrategy("");
    setImpressions("");
    setShowImpressions(false);
    setSuggestions([]);
    setLoaded(false);
  }, [bookingId]);

  const { data: booking, isLoading: bookingLoading, isError: bookingError, refetch: refetchBooking } = useQuery({
    queryKey: ["booking-detail", bookingId],
    queryFn: async () => {
      if (!bookingId) return null;
      const { data, error } = await supabase
        .from("bookings")
        .select("id, mentor_id, liberty_id, session_id, scheduled_date, start_time, end_time, status, is_retroactive, report_required, zoom_join_url")
        .eq("id", bookingId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!bookingId,
  });

  const { data: libertyProfile } = useQuery({
    queryKey: ["liberty-profile", booking?.liberty_id],
    queryFn: async () => {
      if (!booking?.liberty_id) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", booking.liberty_id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!booking?.liberty_id,
  });

  const { data: sessionInfo } = useQuery({
    queryKey: ["session-info", booking?.session_id],
    queryFn: async () => {
      if (!booking?.session_id) return null;
      const { data, error } = await supabase.from("sessions").select("id, name, is_kickoff").eq("id", booking.session_id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!booking?.session_id,
  });

  const { data: allSessions = [] } = useQuery({
    queryKey: ["all-sessions-for-swap"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id, name, order, is_kickoff").order("order");
      if (error) throw error;
      return (data || []) as { id: string; name: string; order: number; is_kickoff: boolean }[];
    },
  });

  // Quem pode editar: o mentor da sessão ou um admin. Outros mentores só leem (D5).
  const canEdit = !!booking && (booking.mentor_id === profile?.id || hasRole("admin"));

  const [swapping, setSwapping] = useState(false);
  // Troca de sessão entregue: pede confirmação em ConfirmDialog (substitui window.confirm)
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);
  const swapTarget = swapTargetId ? allSessions.find((s) => s.id === swapTargetId) : undefined;
  const swapSession = (newSessionId: string) => {
    if (!booking || !newSessionId || newSessionId === booking.session_id || !canEdit) return;
    const target = allSessions.find((s) => s.id === newSessionId);
    const current = allSessions.find((s) => s.id === booking.session_id);
    if (target?.is_kickoff || current?.is_kickoff) {
      toast.error("A troca envolvendo o Mapeamento do Negócio deve ser feita pelo administrador.");
      return;
    }
    setSwapTargetId(newSessionId);
  };
  const confirmSwapSession = async () => {
    if (!booking || !swapTargetId) return;
    const newSessionId = swapTargetId;
    setSwapping(true);
    try {
      const { data, error } = await supabase
        .from("bookings")
        .update({ session_id: newSessionId })
        .eq("id", booking.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Você não tem permissão para alterar esta sessão.");
      toast.success("Sessão alterada");
      queryClient.invalidateQueries({ queryKey: ["session-info", booking.session_id] });
      await invalidateMentorBookingQueries(queryClient);
      setSwapTargetId(null);
    } catch (e) {
      toast.error(translateBookingError(e as { message?: string }, "Erro ao trocar sessão."));
    } finally {
      setSwapping(false);
    }
  };

  const { data: existingReport } = useQuery({
    queryKey: ["booking-report", bookingId],
    queryFn: async () => {
      if (!bookingId) return null;
      const { data, error } = await supabase.from("booking_reports").select("*").eq("booking_id", bookingId).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!bookingId,
  });

  const { data: attachedTools = [] } = useQuery({
    // Prefix must match StudentTools' invalidation key ["student-tools", libertyId]
    queryKey: ["student-tools", libertyProfile?.id, "for-booking", bookingId],
    queryFn: async () => {
      if (!bookingId) return [];
      const { data, error } = await supabase.from("student_tools").select("id").eq("booking_id", bookingId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!bookingId && !!libertyProfile?.id,
  });
  const hasTool = attachedTools.length > 0;

  useEffect(() => {
    if (existingReport && !loaded) {
      setSummary(existingReport.summary || "");
      setDelivered((existingReport as any).delivered || "");
      setNextSteps((existingReport as any).next_steps || "");
      const insights: string = (existingReport as any).ai_insights || "";
      // Best-effort parse of "⚠ Alerta\n...\n\n✦ Sugestão estratégica\n..."
      const alertMatch = insights.match(/⚠\s*Alerta\s*\n([\s\S]*?)(?:\n\n✦|$)/);
      const stratMatch = insights.match(/✦\s*Sugestão estratégica\s*\n([\s\S]*)$/);
      if (alertMatch || stratMatch) {
        setAiAlert((alertMatch?.[1] || "").trim());
        setAiStrategy((stratMatch?.[1] || "").trim());
      } else {
        // Legado: jogamos tudo em sugestão estratégica
        setAiStrategy(insights);
      }
      setImpressions(existingReport.mentor_impressions || "");
      if (existingReport.mentor_impressions) setShowImpressions(true);
      setLoaded(true);
    }
  }, [existingReport, loaded]);

  const essentials = useMemo(() => {
    if (!libertyProfile) return [];
    return [
      { label: "Empresa", value: libertyProfile.company_name, icon: Building2 },
      { label: "Faturamento", value: libertyProfile.monthly_revenue, icon: DollarSign },
      { label: "Instagram", value: libertyProfile.company_instagram || libertyProfile.instagram_personal, icon: Instagram },
      { label: "Principal objetivo", value: libertyProfile.vision_6_months || libertyProfile.dream_2026, icon: Target },
      { label: "Principal dor", value: libertyProfile.main_pain, icon: AlertCircle },
      { label: "História", value: libertyProfile.personal_story, icon: BookOpen },
    ].filter((i) => i.value);
  }, [libertyProfile]);

  const organize = async () => {
    if (transcript.trim().length < 30) {
      toast.error("Cole um resumo do Zoom com mais conteúdo.");
      return;
    }
    setOrganizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("organize-zoom-report", {
        body: {
          transcript: transcript.trim(),
          session_name: sessionInfo?.name,
          liberty_name: libertyProfile?.full_name,
          main_pain: libertyProfile?.main_pain,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSummary(data.summary || "");
      setDelivered(data.delivered || "");
      setNextSteps(data.next_steps || "");
      setAiAlert((data.ai_alert || "").trim());
      setAiStrategy((data.ai_strategy || "").trim());
      const sugs: Suggestion[] = (data.suggested_tasks || []).map((t: string, i: number) => ({
        id: `ai-${Date.now()}-${i}`,
        text: t,
        approved: true,
      }));
      setSuggestions(sugs);
      toast.success("Relatório organizado pela IA.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao organizar com IA");
    } finally {
      setOrganizing(false);
    }
  };

  // A sessão só pode ser concluída (e o relatório enviado) depois do horário de término.
  const sessionEnded = !!booking && isBookingPast(booking);
  const requiresReport = !!booking && bookingRequiresReport(booking);
  const effectiveStatus = booking ? getEffectiveBookingStatus(booking, { hasReport: !!existingReport }) : null;
  const canSave = summary.trim().length > 0 && sessionEnded && canEdit;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!bookingId || !booking) throw new Error("Sessão não encontrada.");
      if (!canEdit) throw new Error("Você não tem permissão para editar o relatório desta sessão.");
      if (!isBookingPast(booking)) throw new Error("COMPLETION_BEFORE_SESSION_END");
      const reportData = {
        booking_id: bookingId,
        summary: summary.trim(),
        delivered: delivered.trim() || null,
        next_steps: nextSteps.trim() || null,
        ai_insights: [aiAlert.trim() && `⚠ Alerta\n${aiAlert.trim()}`, aiStrategy.trim() && `✦ Sugestão estratégica\n${aiStrategy.trim()}`].filter(Boolean).join("\n\n") || null,
        mentor_impressions: impressions.trim() || null,
      };
      // Upsert por booking_id: evita erro de duplicidade em duas abas e RLS silenciosa no update
      const { data: savedRows, error: reportError } = await supabase
        .from("booking_reports")
        .upsert(reportData, { onConflict: "booking_id" })
        .select("id");
      if (reportError) throw reportError;
      if (!savedRows || savedRows.length === 0) throw new Error("Você não tem permissão para editar o relatório desta sessão.");

      const approved = suggestions.filter((s) => s.approved && s.text.trim());
      if (approved.length) {
        const rows = approved.map((s) => ({
          booking_id: bookingId,
          description: s.text.trim(),
          origin: "ai",
          created_by_mentor_id: profile?.id || null,
        }));
        const { error } = await supabase.from("session_tasks").insert(rows);
        if (error) throw error;
        // Limpa já aqui: se o passo seguinte falhar, um novo "Salvar" não duplica as tarefas
        setSuggestions([]);
      }
      // Fecha a sessão como realizada ao salvar o relatório (só para sessões já encerradas e ainda "agendadas").
      const raw = booking.status;
      if (raw === "scheduled" || raw === "rescheduled") {
        const { data: updated, error } = await supabase
          .from("bookings")
          .update({ status: "completed" })
          .eq("id", bookingId)
          .select("id");
        if (error) throw error;
        if (!updated || updated.length === 0) throw new Error("Relatório salvo, mas a sessão não pôde ser marcada como realizada (sem permissão).");
      }
    },
    onSuccess: async () => {
      toast.success("Relatório salvo.");
      await invalidateMentorBookingQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["booking-report", bookingId] });
      queryClient.invalidateQueries({ queryKey: ["booking-detail", bookingId] });
    },
    onError: (error: { message?: string; details?: string }) =>
      toast.error(translateBookingError(error, "Erro ao salvar relatório.")),
  });

  if (!bookingId) {
    return (
      <AppLayout role={layoutRole}>
        <PageContainer variant="narrow">
          <PageHeader back={goBack} title="Relatório da sessão" />
          <EmptyState
            icon={AlertCircle}
            title="Nenhuma sessão selecionada"
            description="Abra o relatório a partir de uma sessão na sua agenda."
            action={<Button variant="outline" size="sm" onClick={goBack}>Voltar</Button>}
          />
        </PageContainer>
      </AppLayout>
    );
  }

  if (bookingLoading) {
    return (
      <AppLayout role={layoutRole}>
        <PageContainer variant="narrow">
          <LoadingState variant="page" />
        </PageContainer>
      </AppLayout>
    );
  }

  if (bookingError || !booking) {
    return (
      <AppLayout role={layoutRole}>
        <PageContainer variant="narrow">
          <PageHeader back={goBack} title="Relatório da sessão" />
          <ErrorState
            title="Sessão não encontrada"
            description={bookingError ? "Não foi possível carregar esta sessão. Verifique sua conexão e tente de novo." : "O link pode estar incorreto ou a sessão foi removida."}
            onRetry={bookingError ? () => refetchBooking() : undefined}
          />
        </PageContainer>
      </AppLayout>
    );
  }

  // Bloqueia relatório/tarefas para sessões canceladas, não realizadas ou aguardando aprovação.
  if (effectiveStatus === "cancelled" || effectiveStatus === "pending_approval" || effectiveStatus === "not_realized") {
    const isBlockedRed = effectiveStatus === "cancelled" || effectiveStatus === "not_realized";
    const title =
      effectiveStatus === "cancelled" ? "Esta sessão foi cancelada"
        : effectiveStatus === "not_realized" ? "Esta sessão foi marcada como não realizada"
          : "Esta sessão ainda não foi aprovada";
    const description =
      effectiveStatus === "cancelled" ? "Sessões canceladas não geram relatório nem tarefas e não contam como mentoria realizada."
        : effectiveStatus === "not_realized" ? "Sessões não realizadas não geram relatório nem tarefas. Se ela aconteceu, peça ao administrador para revisar o status."
          : "Aguarde a aprovação do administrador para registrar o relatório desta sessão.";
    return (
      <AppLayout role={layoutRole}>
        <PageContainer variant="narrow">
          <PageHeader
            back={goBack}
            title="Relatório da sessão"
            description={`${sessionInfo?.name || "Sessão"} · ${format(parseISO(booking.scheduled_date), "dd MMM yyyy", { locale: ptBR })}`}
            actions={<StatusPill status={effectiveStatus} size="md" />}
          />
          <Callout tone={isBlockedRed ? "danger" : "warning"} icon={AlertCircle} title={title}>
            {description}
          </Callout>
        </PageContainer>
      </AppLayout>
    );
  }

  const approvedCount = suggestions.filter((s) => s.approved && s.text.trim()).length;
  const saveHint = !sessionEnded
    ? "O relatório só pode ser enviado depois do horário da sessão."
    : !canEdit
      ? "Somente o mentor responsável pode editar."
      : undefined;

  return (
    <AppLayout role={layoutRole}>
      <PageContainer variant="narrow">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <PageHeader
            back={goBack}
            title="Relatório da sessão"
            description={
              <span className="inline-flex items-center gap-2 flex-wrap">
                <span>
                  {sessionInfo?.name || "Sessão"} · {format(parseISO(booking.scheduled_date), "dd MMM yyyy", { locale: ptBR })} · {booking.start_time?.slice(0, 5) ?? "--:--"}
                  {libertyProfile && ` · ${shortName(libertyProfile.full_name)}`}
                </span>
                {effectiveStatus && <StatusPill status={effectiveStatus} />}
              </span>
            }
            actions={
              booking.zoom_join_url ? (
                <Button asChild variant="outline" size="sm">
                  <a href={booking.zoom_join_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Zoom
                  </a>
                </Button>
              ) : undefined
            }
          />
        </div>

        {/* Avisos de contexto: sessão futura, somente leitura, mapeamento sem relatório */}
        {!sessionEnded && (
          <div>
            <Callout tone="info" icon={Clock} title="O relatório só pode ser enviado depois do horário da sessão">
              Esta sessão termina em {format(parseISO(booking.scheduled_date), "dd/MM", { locale: ptBR })} às {booking.end_time?.slice(0, 5) ?? "--:--"}. Você pode preparar o texto agora, mas o botão de salvar fica liberado só após o término.
            </Callout>
          </div>
        )}
        {!canEdit && (
          <div>
            <Callout tone="info" icon={Lock} title="Sessão de outro mentor · somente leitura">
              Você pode consultar o relatório, mas só o mentor responsável (ou um administrador) pode editá-lo.
            </Callout>
          </div>
        )}
        {!requiresReport && (
          <div>
            <Callout
              tone="info"
              icon={CheckCircle2}
              title={booking.is_retroactive ? "Registro retroativo: não exige relatório" : "Mapeamento do Negócio: não exige relatório"}
              action={
                canEdit && effectiveStatus === "pending_confirmation" ? (
                  <Button size="sm" disabled={actingId === booking.id} onClick={() => markCompleted(booking.id)}>
                    {actingId === booking.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Marcar realizada
                  </Button>
                ) : undefined
              }
            >
              Esta sessão conta como realizada sem relatório. Se quiser, registre observações privadas abaixo.
            </Callout>
          </div>
        )}

        {/* Trocar sessão entregue */}
        {canEdit && (
          <div>
            <SelectField
              label="Sessão entregue"
              hint="Use se a sessão realizada foi diferente da agendada. A troca altera o histórico do aluno."
              value={booking.session_id}
              onChange={(e) => swapSession(e.target.value)}
              disabled={swapping}
            >
              {allSessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>
          </div>
        )}

        {/* Sobre o aluno */}
        {libertyProfile && essentials.length > 0 && (
          <section>
            <SectionCard className="space-y-4">
              <SectionHeader
                as="h3"
                title="Sobre o aluno"
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`${layoutRole === "mentor" ? "/mentor/alunos" : "/admin/membros"}/${libertyProfile.id}`)}
                  >
                    <User /> Ver ficha completa
                  </Button>
                }
              />
              <dl className="grid gap-4 sm:grid-cols-2">
                {essentials.map((e) => (
                  <div key={e.label} className="min-w-0">
                    <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
                      <e.icon className="h-3.5 w-3.5" aria-hidden /> {e.label}
                    </dt>
                    <dd className="text-sm text-foreground leading-relaxed line-clamp-3">{String(e.value)}</dd>
                  </div>
                ))}
              </dl>
            </SectionCard>
          </section>
        )}

        {/* Organizar com IA */}
        <section>
          <SectionCard className="space-y-4">
            <SectionHeader
              as="h3"
              title="Organizar com IA"
              description="Cole o resumo ou a transcrição gerada pelo Zoom. A IA estrutura o relatório e sugere tarefas para você aprovar."
            />
            <TextAreaField
              label="Resumo do Zoom"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Cole aqui o resumo da IA do Zoom..."
              className="min-h-[128px] resize-y"
              hint={transcript.trim().length > 0 && transcript.trim().length < 30 ? "Cole um trecho com mais conteúdo (mínimo 30 caracteres)." : undefined}
            />
            <div>
              <Button variant="secondary" onClick={organize} disabled={organizing || transcript.trim().length < 30}>
                {organizing ? <Loader2 className="animate-spin" /> : <Wand2 />}
                {organizing ? "Organizando..." : "Organizar com IA"}
              </Button>
            </div>
          </SectionCard>
        </section>

        {/* Relatório estruturado */}
        <section>
          <SectionCard className="space-y-4">
            <SectionHeader as="h3" title="Relatório" description="O que o aluno vai ler." />
            <TextAreaField label="Resumo" required value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Panorama da sessão..." className="min-h-[120px] resize-y" />
            <TextAreaField label="O que foi entregue" value={delivered} onChange={(e) => setDelivered(e.target.value)} placeholder="O que foi efetivamente trabalhado..." className="min-h-[96px] resize-y" />
            <TextAreaField label="Próximos passos" value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} placeholder="Encaminhamentos combinados..." className="min-h-[96px] resize-y" />
          </SectionCard>
        </section>

        {/* Insights da IA */}
        <section>
          <SectionCard className="space-y-4">
            <SectionHeader as="h3" title="Insights da IA" />
            {!aiAlert && !aiStrategy ? (
              <p className="text-sm text-muted-foreground">Cole a transcrição do Zoom e toque em “Organizar com IA” para gerar.</p>
            ) : (
              <div className="space-y-4">
                <TextAreaField
                  label={<span className="inline-flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Alerta</span>}
                  value={aiAlert}
                  onChange={(e) => setAiAlert(e.target.value)}
                  placeholder="Nenhum alerta identificado."
                  className="min-h-[72px] resize-y"
                />
                <TextAreaField
                  label={<span className="inline-flex items-center gap-1.5"><Wand2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Sugestão estratégica</span>}
                  value={aiStrategy}
                  onChange={(e) => setAiStrategy(e.target.value)}
                  placeholder="Nenhuma sugestão estratégica registrada."
                  className="min-h-[72px] resize-y"
                />
              </div>
            )}
          </SectionCard>
        </section>

        {/* Tarefas sugeridas */}
        <section>
          <SectionCard className="space-y-4">
            <SectionHeader
              as="h3"
              title="Tarefas para o aluno"
              description={
                suggestions.length === 0
                  ? "As sugestões da IA aparecem aqui depois de organizar a transcrição. Você também pode adicionar tarefas manualmente."
                  : `${approvedCount} de ${suggestions.length} serão enviadas ao checklist do aluno ao salvar. Toque na caixa para aprovar ou rejeitar.`
              }
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSuggestions((cur) => [...cur, { id: `m-${Date.now()}`, text: "", approved: true }])}
                >
                  <Plus /> Adicionar
                </Button>
              }
            />
            {suggestions.length > 0 && (
              <ul className="divide-y divide-border -mx-4 sm:-mx-6">
                {suggestions.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 px-4 sm:px-6 py-2.5 min-h-[48px]">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={s.approved}
                      aria-label={s.approved ? "Tarefa aprovada" : "Tarefa rejeitada"}
                      onClick={() => setSuggestions((cur) => cur.map((x) => x.id === s.id ? { ...x, approved: !x.approved } : x))}
                      className={cn(
                        "hit-44 relative mt-0.5 h-5 w-5 rounded-[6px] border flex items-center justify-center shrink-0 transition-colors duration-ds-1 ease-ds",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                        s.approved ? "bg-primary border-primary text-primary-foreground" : "border-border bg-card",
                      )}
                    >
                      {s.approved && <Check className="h-3.5 w-3.5" aria-hidden />}
                    </button>
                    <textarea
                      value={s.text}
                      rows={1}
                      aria-label="Descrição da tarefa"
                      placeholder="Descreva a tarefa..."
                      onChange={(e) => {
                        setSuggestions((cur) => cur.map((x) => x.id === s.id ? { ...x, text: e.target.value } : x));
                        e.target.style.height = "auto";
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      ref={(el) => {
                        if (el) {
                          el.style.height = "auto";
                          el.style.height = `${el.scrollHeight}px`;
                        }
                      }}
                      className={cn(
                        "flex-1 min-w-0 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground leading-relaxed break-words whitespace-pre-wrap py-0.5",
                        "border-b border-transparent focus:outline-none focus-visible:border-ring",
                        !s.approved && "line-through text-muted-foreground",
                      )}
                    />
                    <IconButton
                      aria-label="Remover tarefa"
                      size="sm"
                      onClick={() => setSuggestions((cur) => cur.filter((x) => x.id !== s.id))}
                      className="-mt-1 hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </section>

        {/* Ferramentas anexadas a esta sessão */}
        {libertyProfile?.id && bookingId && (
          <div>
            <StudentTools libertyId={libertyProfile.id} bookingId={bookingId} />
          </div>
        )}

        {/* Observações privadas */}
        <section>
          {!showImpressions ? (
            <SectionCard as="button" interactive onClick={() => setShowImpressions(true)} className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">Observações privadas</span>
                <span className="block text-xs text-muted-foreground">Não compartilhadas com o aluno. Só você e os administradores veem.</span>
              </span>
              <Plus className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            </SectionCard>
          ) : (
            <SectionCard className="space-y-3">
              <SectionHeader
                as="h3"
                title={<span className="inline-flex items-center gap-2"><Lock className="h-4 w-4 text-muted-foreground" aria-hidden /> Observações privadas</span>}
                description="Privado. Não compartilhado com o aluno."
              />
              <TextAreaField
                aria-label="Observações privadas"
                value={impressions}
                onChange={(e) => setImpressions(e.target.value)}
                placeholder="Percepções estratégicas, alertas, oportunidades..."
                className="min-h-[112px] resize-y"
              />
            </SectionCard>
          )}
        </section>

        {/* Checklist de conclusão da sessão */}
        <section>
          <SectionCard className="space-y-3">
            <SectionHeader
              as="h3"
              title={<span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden /> Para concluir a sessão</span>}
            />
            <ul className="space-y-2 text-sm">
              {[
                { ok: sessionEnded, label: "Horário da sessão encerrado" },
                { ok: summary.trim().length > 0, label: "Resumo preenchido" },
                { ok: hasTool, label: "Ferramenta anexada (recomendado)" },
              ].map((item) => (
                <li key={item.label} className={cn("flex items-center gap-2", item.ok ? "text-foreground" : "text-muted-foreground")}>
                  <Check className={cn("h-4 w-4 shrink-0", !item.ok && "opacity-30")} aria-hidden /> {item.label}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {!sessionEnded
                ? "O relatório só pode ser enviado depois do horário da sessão."
                : "A sessão é marcada como realizada ao salvar o relatório com o resumo preenchido. A ferramenta é recomendada, mas não obrigatória."}
            </p>
          </SectionCard>
        </section>

        {/* Ações: fixas na base no mobile */}
        <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] lg:static z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 py-3 bg-background border-t border-border lg:mx-0 lg:p-0 lg:bg-transparent lg:border-0">
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button variant="outline" size="lg" onClick={() => setDeliverableOpen(true)}>
              <FileText /> Gerar material
            </Button>
            <Button
              size="lg"
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
              title={saveHint}
              className="w-full sm:w-auto"
            >
              {saveMutation.isPending ? <Loader2 className="animate-spin" /> : <FileText />}
              {existingReport ? "Atualizar relatório" : "Salvar relatório"}
            </Button>
          </div>
          {saveHint && <p className="text-xs text-muted-foreground text-right mt-2">{saveHint}</p>}
        </div>
      </div>
      </PageContainer>

      <ConfirmDialog
        open={!!swapTargetId}
        onOpenChange={(open) => { if (!open && !swapping) setSwapTargetId(null); }}
        title="Trocar a sessão entregue?"
        description={`A sessão passa a ser “${swapTarget?.name ?? "outra sessão"}”. Isso altera o histórico do aluno.`}
        confirmLabel="Trocar sessão"
        loading={swapping}
        onConfirm={confirmSwapSession}
      />

      {libertyProfile && (
        <SessionDeliverableDialog
          open={deliverableOpen}
          onOpenChange={setDeliverableOpen}
          memberName={libertyProfile.full_name || ""}
          mentorName={profile?.full_name || ""}
          sessionName={sessionInfo?.name}
          mainPain={libertyProfile.main_pain || undefined}
          companyName={libertyProfile.company_name || undefined}
          memberTier={(libertyProfile as any).tier || undefined}
        />
      )}
    </AppLayout>
  );
};

export default MentorRelatorioPage;
