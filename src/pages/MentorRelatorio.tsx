import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGoBack } from "@/lib/navigation";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import {
  ArrowLeft, ExternalLink, AlertCircle, Wand2, Lock, Check, FileText,
  Building2, Target, Instagram, DollarSign, BookOpen, User, Loader2, Plus, X,
  Paperclip, ShieldCheck,
} from "lucide-react";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { shortName } from "@/lib/formatName";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveBookingStatus } from "@/lib/bookingStatus";
import { StudentTools } from "@/components/StudentTools";
import { SessionDeliverableDialog } from "@/components/SessionDeliverableDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCcw } from "lucide-react";


type Suggestion = { id: string; text: string; approved: boolean };

const MentorRelatorioPage = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasRole, profile } = useAuth();
  const layoutRole: "admin" | "mentor" = hasRole("admin") ? "admin" : "mentor";
  const goBack = useGoBack(hasRole("admin") ? "/admin/membros" : "/mentor/sessoes");

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
  
  

  const { data: booking } = useQuery({
    queryKey: ["booking-detail", bookingId],
    queryFn: async () => {
      if (!bookingId) return null;
      const { data, error } = await supabase.from("bookings").select("*").eq("id", bookingId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!bookingId,
  });

  const { data: libertyProfile } = useQuery({
    queryKey: ["liberty-profile", booking?.liberty_id],
    queryFn: async () => {
      if (!booking?.liberty_id) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", booking.liberty_id).single();
      return data;
    },
    enabled: !!booking?.liberty_id,
  });

  const { data: sessionInfo } = useQuery({
    queryKey: ["session-info", booking?.session_id],
    queryFn: async () => {
      if (!booking?.session_id) return null;
      const { data } = await supabase.from("sessions").select("id, name").eq("id", booking.session_id).single();
      return data;
    },
    enabled: !!booking?.session_id,
  });

  const { data: allSessions = [] } = useQuery({
    queryKey: ["all-sessions-for-swap"],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("id, name, order").order("order");
      return (data || []) as { id: string; name: string; order: number }[];
    },
  });

  const [swapping, setSwapping] = useState(false);
  const swapSession = async (newSessionId: string) => {
    if (!booking || !newSessionId || newSessionId === booking.session_id) return;
    setSwapping(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ session_id: newSessionId })
        .eq("id", booking.id);
      if (error) throw error;
      toast.success("Sessão alterada");
      queryClient.invalidateQueries({ queryKey: ["booking-detail", bookingId] });
      queryClient.invalidateQueries({ queryKey: ["session-info", booking.session_id] });
    } catch (e: any) {
      toast.error("Erro ao trocar sessão: " + e.message);
    } finally {
      setSwapping(false);
    }
  };

  const { data: existingReport, refetch: refetchReport } = useQuery({
    queryKey: ["booking-report", bookingId],
    queryFn: async () => {
      if (!bookingId) return null;
      const { data } = await supabase.from("booking_reports").select("*").eq("booking_id", bookingId).maybeSingle();
      return data;
    },
    enabled: !!bookingId,
  });

  const { data: attachedTools = [] } = useQuery({
    // Prefix must match StudentTools' invalidation key ["student-tools", libertyId]
    queryKey: ["student-tools", libertyProfile?.id, "for-booking", bookingId],
    queryFn: async () => {
      if (!bookingId) return [];
      const { data } = await supabase.from("student_tools").select("id").eq("booking_id", bookingId);
      return data || [];
    },
    enabled: !!bookingId && !!libertyProfile?.id,
  });
  const hasTool = attachedTools.length > 0;
  const pdfSent = !!(existingReport as any)?.pdf_delivered_at;

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

  const canSave = summary.trim().length > 0;
  // O envio do PDF ainda está em ajustes — por enquanto a sessão conclui com relatório + ferramenta.
  const canComplete = canSave && hasTool;


  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!bookingId) throw new Error("No booking ID");
      const reportData: any = {
        booking_id: bookingId,
        summary: summary.trim(),
        delivered: delivered.trim() || null,
        next_steps: nextSteps.trim() || null,
        ai_insights: [aiAlert.trim() && `⚠ Alerta\n${aiAlert.trim()}`, aiStrategy.trim() && `✦ Sugestão estratégica\n${aiStrategy.trim()}`].filter(Boolean).join("\n\n") || null,
        mentor_impressions: impressions.trim() || null,
      };
      if (existingReport) {
        const { error } = await supabase.from("booking_reports").update(reportData).eq("id", existingReport.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("booking_reports").insert(reportData);
        if (error) throw error;
      }
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
      }
      // Conclui a sessão assim que o relatório for salvo (resumo preenchido),
      // independente de ferramenta anexada — evita sessões passadas ficarem "agendadas"
      // e desaparecerem da aba Realizadas do mentor.
      if (
        summary.trim().length > 0 &&
        booking &&
        getEffectiveBookingStatus(booking) !== "cancelled" &&
        booking.status !== "completed" &&
        booking.status !== "not_realized" &&
        booking.status !== "pending_approval"
      ) {
        const { error } = await supabase.from("bookings").update({ status: "completed" }).eq("id", bookingId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-report", bookingId] });
      queryClient.invalidateQueries({ queryKey: ["mentor-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      setSuggestions([]);
      toast.success("Relatório salvo.");
    },
    onError: () => toast.error("Erro ao salvar relatório"),
  });


  if (!bookingId) {
    return (
      <AppLayout role={layoutRole}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma sessão selecionada.</p>
        </div>
      </AppLayout>
    );
  }

  // Bloqueia relatório/tarefas para sessões canceladas ou aguardando aprovação.
  const effectiveStatus = booking ? getEffectiveBookingStatus(booking) : null;
  if (booking && (effectiveStatus === "cancelled" || effectiveStatus === "pending_approval")) {
    const isCancelled = effectiveStatus === "cancelled";
    return (
      <AppLayout role={layoutRole}>
        <div className="max-w-2xl mx-auto mt-12">
          <button onClick={goBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
            <ArrowLeft className="h-3 w-3" /> Voltar
          </button>
          <div className={`rounded-2xl border p-6 ${isCancelled ? "border-destructive/30 bg-destructive/5" : "border-status-yellow/30 bg-status-yellow/5"}`}>
            <div className="flex items-start gap-3">
              <AlertCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isCancelled ? "text-destructive" : "text-status-yellow"}`} />
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">
                  {isCancelled ? "Esta sessão foi cancelada" : "Esta sessão ainda não foi aprovada"}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {isCancelled
                    ? "Sessões canceladas não geram relatório nem tarefas e não contam como mentoria realizada."
                    : "Aguarde a aprovação do administrador para registrar o relatório desta sessão."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout role={layoutRole}>
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <motion.div variants={fadeUpItem} className="flex items-start gap-3">
          <button onClick={goBack} className="p-1.5 rounded-lg hover:bg-muted transition-colors mt-1">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-foreground">Relatório da sessão</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {sessionInfo?.name || "Sessão"} · {booking ? format(parseISO(booking.scheduled_date), "dd MMM yyyy", { locale: ptBR }) : ""}
              {libertyProfile && ` · ${shortName(libertyProfile.full_name)}`}
            </p>
            {booking && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                  <RefreshCcw className="h-3 w-3" /> Trocar sessão entregue
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Select value={booking.session_id} onValueChange={swapSession} disabled={swapping}>
                        <SelectTrigger className="h-7 w-[260px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allSessions.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Use se a sessão real entregue foi diferente da agendada.</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
          {booking?.zoom_join_url && (
            <a href={booking.zoom_join_url} target="_blank" rel="noopener noreferrer" className="btn-silver text-xs px-3 py-2 flex items-center gap-1.5">
              <ExternalLink className="h-3 w-3" /> Zoom
            </a>
          )}
        </motion.div>

        {/* Essentials about the student */}
        {libertyProfile && essentials.length > 0 && (
          <motion.div variants={fadeUpItem} className="rounded-2xl border border-border bg-card/70 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Sobre o aluno</p>
              <button
                onClick={() => navigate(`${layoutRole === "mentor" ? "/mentor/alunos" : "/admin/membros"}/${libertyProfile.id}`)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <User className="h-3 w-3" /> Ver ficha completa
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {essentials.map((e) => (
                <div key={e.label} className="rounded-xl border border-border bg-background/40 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    <e.icon className="h-3 w-3 text-primary" /> {e.label}
                  </div>
                  <p className="text-sm text-foreground leading-relaxed line-clamp-3">{String(e.value)}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Paste Zoom transcript + AI */}
        <motion.div variants={fadeUpItem} className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3">
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider">
            <Wand2 className="h-3.5 w-3.5" /> Organizar com IA
          </div>
          <p className="text-xs text-muted-foreground">
            Cole o resumo/transcrição que a IA do Zoom gerou. A IA estrutura tudo abaixo e sugere tarefas para você aprovar.
          </p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Cole aqui o resumo da IA do Zoom..."
            className="w-full bg-card border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/30 resize-none h-32"
          />
          <button
            onClick={organize}
            disabled={organizing || transcript.trim().length < 30}
            className="btn-silver text-xs px-4 py-2 flex items-center gap-2 disabled:opacity-40"
          >
            {organizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {organizing ? "Organizando..." : "Organizar com IA"}
          </button>
        </motion.div>

        {/* Structured report */}
        <motion.div variants={fadeUpItem} className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <Field label="Resumo" required value={summary} onChange={setSummary} placeholder="Panorama da sessão..." rows={5} />
            <Field label="O que foi entregue" value={delivered} onChange={setDelivered} placeholder="O que foi efetivamente trabalhado..." rows={4} />
            <Field label="Próximos passos" value={nextSteps} onChange={setNextSteps} placeholder="Encaminhamentos combinados..." rows={4} />
          </div>

          <aside className="space-y-4">
            {/* AI insights — split into Alerta and Sugestão estratégica */}
            <div className="rounded-xl border border-border bg-card/70 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-primary font-semibold flex items-center gap-1.5">
                <Wand2 className="h-3 w-3" /> Insights da IA
              </p>
              {!aiAlert && !aiStrategy ? (
                <p className="text-xs text-muted-foreground italic">Cole a transcrição do Zoom e clique em "Organizar com IA" para gerar.</p>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-status-yellow/20 bg-status-yellow/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-status-yellow font-semibold mb-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Alerta
                    </p>
                    <textarea
                      value={aiAlert}
                      onChange={(e) => setAiAlert(e.target.value)}
                      placeholder="Nenhum alerta identificado."
                      className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none resize-none leading-relaxed min-h-[56px]"
                    />
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1 flex items-center gap-1">
                      <Wand2 className="h-3 w-3" /> Sugestão estratégica
                    </p>
                    <textarea
                      value={aiStrategy}
                      onChange={(e) => setAiStrategy(e.target.value)}
                      placeholder="Nenhuma sugestão estratégica registrada."
                      className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none resize-none leading-relaxed min-h-[56px]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Suggested tasks */}
            <div className="rounded-xl border border-border bg-card/70 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-primary font-semibold flex items-center gap-1.5">
                  <Target className="h-3 w-3" /> Tarefas para o aluno
                </p>
                <button
                  onClick={() => setSuggestions((cur) => [...cur, { id: `m-${Date.now()}`, text: "", approved: true }])}
                  className="text-[10px] text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Adicionar
                </button>
              </div>
              {suggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  As sugestões da IA aparecem aqui depois de organizar a transcrição. Você também pode adicionar tarefas manualmente.
                </p>
              ) : (
                <>
                  <p className="text-[10px] text-muted-foreground">
                    {suggestions.filter((s) => s.approved && s.text.trim()).length} de {suggestions.length} serão enviadas ao checklist do aluno ao salvar. Toque no quadradinho para aprovar ou rejeitar.
                  </p>
                <ul className="space-y-2">
                  {suggestions.map((s) => (
                    <li key={s.id} className="flex items-start gap-2 group">
                      <button
                        onClick={() => setSuggestions((cur) => cur.map((x) => x.id === s.id ? { ...x, approved: !x.approved } : x))}
                        className={`mt-1 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${s.approved ? "bg-primary border-primary text-primary-foreground" : "border-border bg-background"}`}
                        title={s.approved ? "Aprovada" : "Rejeitada"}
                      >
                        {s.approved && <Check className="h-3 w-3" />}
                      </button>
                      <textarea
                        value={s.text}
                        rows={1}
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
                        className={`flex-1 min-w-0 resize-none bg-transparent text-xs text-foreground focus:outline-none border-b border-transparent focus:border-primary/30 leading-relaxed break-words whitespace-pre-wrap ${s.approved ? "" : "line-through text-muted-foreground"}`}
                      />
                      <button
                        onClick={() => setSuggestions((cur) => cur.filter((x) => x.id !== s.id))}
                        className="mt-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
                </>
              )}
            </div>
          </aside>
        </motion.div>

        {/* Tools attached to this session */}
        {libertyProfile?.id && bookingId && (
          <motion.div variants={fadeUpItem}>
            <StudentTools libertyId={libertyProfile.id} bookingId={bookingId} />
          </motion.div>
        )}

        {/* Private mentor impressions */}
        <motion.div variants={fadeUpItem}>
          {!showImpressions ? (
            <button
              onClick={() => setShowImpressions(true)}
              className="w-full glass-card p-4 text-left flex items-center gap-3 hover:border-primary/30 transition-all"
            >
              <Lock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Observações privadas</p>
                <p className="text-xs text-muted-foreground">Não compartilhadas com o aluno. Só você e os admins veem.</p>
              </div>
            </button>
          ) : (
            <div className="border border-status-yellow/20 rounded-xl overflow-hidden">
              <div className="bg-status-yellow/5 px-3 py-2 flex items-center gap-2">
                <Lock className="h-3 w-3 text-status-yellow" />
                <span className="text-[10px] text-status-yellow font-medium">Privado, não compartilhado com o aluno</span>
              </div>
              <textarea
                value={impressions}
                onChange={(e) => setImpressions(e.target.value)}
                placeholder="Percepções estratégicas, alertas, oportunidades..."
                className="w-full bg-card border-0 p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-none h-28"
              />
            </div>
          )}
        </motion.div>

        {/* Checklist de conclusão da sessão */}
        <motion.div variants={fadeUpItem} className="rounded-2xl border border-border bg-card/70 p-4 space-y-3">
          <div className="flex items-center gap-2 text-primary text-[10px] font-semibold uppercase tracking-wider">
            <ShieldCheck className="h-3.5 w-3.5" /> Para concluir a sessão
          </div>
          <ul className="space-y-1.5 text-xs">
            <li className={`flex items-center gap-2 ${canSave ? "text-status-green" : "text-muted-foreground"}`}>
              <Check className={`h-3.5 w-3.5 ${canSave ? "" : "opacity-30"}`} /> Relatório preenchido
            </li>
            <li className={`flex items-center gap-2 ${hasTool ? "text-status-green" : "text-muted-foreground"}`}>
              <Check className={`h-3.5 w-3.5 ${hasTool ? "" : "opacity-30"}`} /> Ferramenta anexada
            </li>
          </ul>
          {!canComplete && (
            <p className="text-[10px] text-status-yellow flex items-start gap-1">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              A sessão é marcada como concluída ao salvar com relatório e ferramenta anexada.
            </p>
          )}
        </motion.div>

        <motion.div variants={fadeUpItem} className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => setDeliverableOpen(true)}
            className="text-xs px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary flex items-center gap-2 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Gerar {sessionInfo?.name ? `"${sessionInfo.name}"` : "material da sessão"}
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave || saveMutation.isPending}
            className="btn-silver px-6 py-2.5 text-sm disabled:opacity-40 flex items-center gap-2"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {existingReport ? "Atualizar relatório" : "Salvar relatório"}
          </button>
        </motion.div>
      </motion.div>

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _icons_used = [Paperclip];

const Field = ({
  label, value, onChange, placeholder, rows = 4, required,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; required?: boolean;
}) => (
  <div>
    <label className="text-xs text-muted-foreground mb-1 block">
      {label} {required && <span className="text-destructive">*</span>}
    </label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ minHeight: `${rows * 24}px` }}
      className="w-full bg-card border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/30 resize-y"
    />
  </div>
);

export default MentorRelatorioPage;
