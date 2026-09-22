import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClipboardCheck, Send, Star, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";

type NpsRow = {
  id: string;
  liberty_id: string;
  mentor_id: string | null;
  session_id: string | null;
  booking_id: string | null;
  liberty_name: string | null;
  session_name: string | null;
  mentor_name: string | null;
  score_overall: number | null;
  score_content: number | null;
  score_mentor: number | null;
  score_action_plan: number | null;
  score_tool: number | null;
  key_takeaway: string | null;
  improvements: string | null;
  would_recommend: string | null;
  created_at: string;
};

const scoreLabels: { key: keyof NpsRow; label: string }[] = [
  { key: "score_overall", label: "Sessão" },
  { key: "score_content", label: "Conteúdo" },
  { key: "score_mentor", label: "Mentor" },
  { key: "score_action_plan", label: "Plano de Ação" },
  { key: "score_tool", label: "Ferramenta" },
];

const scoreTone = (n: number | null) => {
  if (n == null) return "text-muted-foreground bg-muted";
  if (n >= 9) return "text-status-green bg-status-green/10";
  if (n >= 7) return "text-status-yellow bg-status-yellow/10";
  return "text-status-red bg-status-red/10";
};

const avg = (rows: NpsRow[], key: keyof NpsRow) => {
  const vals = rows.map((r) => r[key] as number | null).filter((v): v is number => typeof v === "number");
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
};

type PendingRow = {
  booking_id: string;
  liberty_id: string | null;
  liberty_name: string;
  session_name: string;
  mentor_name: string;
  date: string;
};

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => format(parseISO(`${key}-01`), "MMMM 'de' yyyy", { locale: ptBR });

const AdminNps = () => {
  const [rows, setRows] = useState<NpsRow[]>([]);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("nps_responses")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) toast.error("Erro ao carregar NPS: " + error.message);
      const answered = (data as any as NpsRow[]) || [];
      setRows(answered);

      // Sessões realizadas que ainda não receberam resposta de NPS
      const { data: doneBookings } = await supabase
        .from("bookings")
        .select("id, scheduled_date, liberty_id, sessions(name), liberty:profiles!bookings_liberty_id_fkey(full_name), mentor:profiles!bookings_mentor_id_fkey(full_name)")
        .eq("status", "completed")
        .order("scheduled_date", { ascending: false })
        .limit(200);
      const answeredIds = new Set(answered.map((r) => r.booking_id).filter(Boolean) as string[]);
      setPending(
        (doneBookings || [])
          .filter((b: any) => !answeredIds.has(b.id))
          .map((b: any) => ({
            booking_id: b.id,
            liberty_id: b.liberty_id ?? null,
            liberty_name: b.liberty?.full_name || "Membro",
            session_name: b.sessions?.name || "Sessão",
            mentor_name: b.mentor?.full_name || "Sem dados",
            date: b.scheduled_date,
          })),
      );
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const overall = avg(rows, "score_overall");
    const promoters = rows.filter((r) => (r.score_overall ?? 0) >= 9).length;
    const detractors = rows.filter((r) => (r.score_overall ?? 0) <= 6).length;
    const nps = rows.length ? Math.round(((promoters - detractors) / rows.length) * 100) : null;
    return { overall, promoters, detractors, nps, total: rows.length };
  }, [rows]);

  const months = useMemo(() => {
    const set = new Set(pending.filter((p) => p.date).map((p) => monthKey(p.date)));
    set.add(new Date().toISOString().slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [pending]);

  const monthPending = useMemo(
    () => pending.filter((p) => p.date && monthKey(p.date) === selectedMonth),
    [pending, selectedMonth],
  );

  // Um convite por aluno (sessão mais recente sem NPS no mês selecionado)
  const monthTargets = useMemo(() => {
    const byMember = new Map<string, PendingRow>();
    for (const p of monthPending) {
      if (!p.liberty_id) continue;
      if (!byMember.has(p.liberty_id)) byMember.set(p.liberty_id, p);
    }
    return Array.from(byMember.values());
  }, [monthPending]);

  const dispatchMonth = async () => {
    if (!monthTargets.length) {
      toast.info("Nenhum aluno pendente nesse mês.");
      return;
    }
    setDispatching(true);
    try {
      const ids = monthTargets.map((t) => t.liberty_id!) as string[];
      const { data: profs, error: pe } = await supabase
        .from("profiles")
        .select("id, user_id")
        .in("id", ids);
      if (pe) throw pe;
      const userMap = new Map((profs || []).map((p: any) => [p.id, p.user_id]));

      const payload = monthTargets
        .filter((t) => userMap.get(t.liberty_id!))
        .map((t) => ({
          user_id: userMap.get(t.liberty_id!) as string,
          type: "nps_request",
          title: "Pesquisa de satisfação (NPS)",
          message: `Como foi a sessão "${t.session_name}"? Sua opinião é essencial e leva menos de 2 minutos.`,
          link: `/nps/${t.booking_id}`,
          related_booking_id: t.booking_id,
        }));

      const skipped = monthTargets.length - payload.length;
      if (!payload.length) {
        toast.error("Nenhum dos alunos pendentes possui acesso ativado.");
        return;
      }
      const { error } = await supabase.from("notifications").insert(payload);
      if (error) throw error;
      toast.success(
        `Convite de NPS enviado para ${payload.length} aluno(s)` +
          (skipped > 0 ? ` · ${skipped} sem acesso ativado` : ""),
      );
    } catch (e: any) {
      toast.error("Erro no disparo: " + (e?.message || "desconhecido"));
    } finally {
      setDispatching(false);
    }
  };

  return (
    <AppLayout role="admin">
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Pesquisas de NPS</h1>
            <p className="text-sm text-muted-foreground">
              Respostas de satisfação enviadas pelos membros dentro do app.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={Users} label="Respostas" value={String(stats.total)} tone="primary" />
          <StatCard icon={Star} label="Nota média" value={stats.overall != null ? stats.overall.toFixed(1) : "Sem dados"} tone="yellow" />
          <StatCard icon={TrendingUp} label="Promotores" value={String(stats.promoters)} tone="green" />
          <StatCard icon={TrendingUp} label="NPS" value={stats.nps != null ? String(stats.nps) : "Sem dados"} tone="primary" />
          <StatCard icon={ClipboardCheck} label="Sem resposta" value={String(pending.length)} tone="red" />
        </div>

        {/* ===== DISPARO DE NPS POR MÊS ===== */}
        <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <Send className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Disparo de NPS</p>
              <p className="text-xs text-muted-foreground">
                Escolha o mês e envie o convite para todos os alunos que ainda não responderam. O aviso aparece
                destacado no início da plataforma do aluno.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground block">
                Mês
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground capitalize focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {months.map((m) => (
                  <option key={m} value={m} className="capitalize">
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Alunos pendentes</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{monthTargets.length}</p>
            </div>
            <button
              onClick={dispatchMonth}
              disabled={dispatching || monthTargets.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {dispatching ? "Enviando…" : `Disparar para ${monthTargets.length} aluno(s)`}
            </button>
          </div>

          {monthTargets.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {monthTargets.map((t) => t.liberty_name).join(" · ")}
            </p>
          )}
        </div>

        {pending.length > 0 && (
          <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Sessões realizadas sem NPS respondido</p>
              <p className="text-xs text-muted-foreground">O convite fica disponível no app do membro até ele responder.</p>
            </div>
            <ul className="divide-y divide-border/40 max-h-72 overflow-y-auto">
              {pending.map((p) => (
                <li key={p.booking_id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{p.liberty_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.session_name} · {p.mentor_name}</p>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {format(parseISO(p.date), "dd MMM", { locale: ptBR })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
            Nenhuma resposta de NPS registrada ainda.
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card/80 overflow-hidden">
            <div className="grid grid-cols-[1fr,1fr,auto,auto] gap-4 px-4 py-3 border-b border-border text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
              <span>Membro / Sessão</span>
              <span>Mentor</span>
              <span className="text-right">Nota</span>
              <span className="text-right">Data</span>
            </div>
            <ul className="divide-y divide-border/40">
              {rows.map((r) => {
                const isOpen = expanded === r.id;
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      className="w-full grid grid-cols-[1fr,1fr,auto,auto] gap-4 px-4 py-3 items-center text-left hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{r.liberty_name || "Membro"}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.session_name || "Sem dados"}</p>
                      </div>
                      <div className="text-sm text-foreground/90 truncate">{r.mentor_name || "Sem dados"}</div>
                      <div className={`text-sm font-bold px-2.5 py-1 rounded-lg tabular-nums ${scoreTone(r.score_overall)}`}>
                        {r.score_overall ?? "Sem dados"}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums text-right">
                        {format(parseISO(r.created_at), "dd MMM · HH:mm", { locale: ptBR })}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 bg-muted/20 border-t border-border/40 space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                          {scoreLabels.map((s) => (
                            <div key={s.key} className="rounded-xl border border-border bg-card px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                              <p className={`text-lg font-bold tabular-nums ${scoreTone(r[s.key] as number | null).split(" ")[0]}`}>
                                {(r[s.key] as number | null) ?? "Sem dados"}
                              </p>
                            </div>
                          ))}
                        </div>
                        <ResponseField label="Maior chave da sessão" value={r.key_takeaway} />
                        <ResponseField label="Sugestões de melhoria" value={r.improvements} />
                        <ResponseField label="Indicaria a mentoria?" value={r.would_recommend} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

const StatCard = ({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  tone: "primary" | "green" | "yellow" | "red";
}) => {
  const toneMap: Record<string, string> = {
    primary: "text-primary bg-primary/10 border-primary/20",
    green: "text-status-green bg-status-green/10 border-status-green/20",
    yellow: "text-status-yellow bg-status-yellow/10 border-status-yellow/20",
    red: "text-status-red bg-status-red/10 border-status-red/20",
  };
  return (
    <div className="rounded-2xl border border-border bg-card/80 p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-xl border flex items-center justify-center ${toneMap[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
      </div>
    </div>
  );
};

const ResponseField = ({ label, value }: { label: string; value: string | null }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">{label}</p>
    <p className="text-sm text-foreground whitespace-pre-wrap">{value || <span className="text-muted-foreground italic">sem resposta</span>}</p>
  </div>
);

export default AdminNps;
