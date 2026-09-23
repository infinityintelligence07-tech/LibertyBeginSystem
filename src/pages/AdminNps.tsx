import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClipboardCheck, Send, Star, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  SectionHeader,
  SectionCard,
  ListRow,
  DateBlock,
  StatusPill,
  Stat,
  ProgressBar,
  BottomSheet,
  SelectField,
  LoadingState,
  EmptyState,
} from "@/components/ds";
import type { PillTone } from "@/components/ds";

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
  { key: "score_action_plan", label: "Plano de ação" },
  { key: "score_tool", label: "Ferramenta" },
];

const scoreTone = (n: number | null): PillTone => {
  if (n == null) return "neutral";
  if (n >= 9) return "success";
  if (n >= 7) return "warning";
  return "danger";
};

const scoreBarTone = (n: number): "success" | "warning" | "pending" => {
  if (n >= 9) return "success";
  if (n >= 7) return "warning";
  return "pending";
};

const statTone = (n: number | null): "default" | "success" | "warning" | "danger" => {
  if (n == null) return "default";
  if (n >= 9) return "success";
  if (n >= 7) return "warning";
  return "danger";
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
const monthLabel = (key: string) => {
  const label = format(parseISO(`${key}-01`), "MMMM 'de' yyyy", { locale: ptBR });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

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

  // Distribuição da nota geral (0 a 10), apenas para leitura visual.
  const distribution = useMemo(() => {
    const counts = Array.from({ length: 11 }, () => 0);
    rows.forEach((r) => {
      if (typeof r.score_overall === "number" && r.score_overall >= 0 && r.score_overall <= 10) counts[r.score_overall]++;
    });
    const scored = counts.reduce((a, b) => a + b, 0);
    return { counts, scored };
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

  const openResponse = rows.find((r) => r.id === expanded);

  return (
    <AppLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Pesquisas de NPS"
          description="Respostas de satisfação enviadas pelos membros dentro do app."
        />

        {loading ? (
          <>
            <LoadingState variant="stats" rows={4} />
            <LoadingState variant="list" rows={4} />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SectionCard padding="compact">
                <Stat icon={Users} label="Respostas" value={stats.total} />
              </SectionCard>
              <SectionCard padding="compact">
                <Stat
                  icon={Star}
                  label="Nota média"
                  value={stats.overall != null ? stats.overall.toFixed(1) : "Sem dados"}
                  hint={stats.overall != null ? "de 10" : undefined}
                  tone={statTone(stats.overall) === "danger" ? "danger" : "default"}
                />
              </SectionCard>
              <SectionCard padding="compact">
                <Stat icon={TrendingUp} label="Promotores" value={stats.promoters} hint={stats.total ? `de ${stats.total}` : undefined} />
              </SectionCard>
              <SectionCard padding="compact">
                <Stat icon={TrendingUp} label="NPS" value={stats.nps != null ? stats.nps : "Sem dados"} />
              </SectionCard>
              <SectionCard padding="compact" className="col-span-2 md:col-span-1">
                <Stat icon={ClipboardCheck} label="Sem resposta" value={pending.length} tone={pending.length > 0 ? "pending" : "default"} />
              </SectionCard>
            </div>

            <SectionCard as="section" className="space-y-4">
              <SectionHeader
                as="h3"
                title="Disparo de NPS"
                description="Escolha o mês e envie o convite para todos os alunos que ainda não responderam. O aviso aparece destacado no início da plataforma do aluno."
              />
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end gap-3">
                <SelectField label="Mês" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                  {months.map((m) => (
                    <option key={m} value={m}>{monthLabel(m)}</option>
                  ))}
                </SelectField>
                <div className="px-4 py-2 rounded-ds border border-border bg-card">
                  <Stat size="sm" label="Alunos pendentes" value={monthTargets.length} />
                </div>
                <Button onClick={dispatchMonth} disabled={dispatching || monthTargets.length === 0} className="sm:h-11">
                  <Send aria-hidden />
                  {dispatching ? "Enviando..." : `Disparar para ${monthTargets.length} aluno(s)`}
                </Button>
              </div>
              {monthTargets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {monthTargets.map((t) => (
                    <StatusPill key={t.booking_id} tone="neutral" withDot={false}>{t.liberty_name}</StatusPill>
                  ))}
                </div>
              )}
            </SectionCard>

            {rows.length > 0 && (
              <SectionCard as="section" className="space-y-4">
                <SectionHeader as="h3" title="Distribuição das notas" description={`Nota geral da sessão · ${distribution.scored} ${distribution.scored === 1 ? "resposta com nota" : "respostas com nota"}`} />
                <ul className="space-y-2">
                  {distribution.counts.map((count, note) => note).reverse().map((note) => {
                    const count = distribution.counts[note];
                    return (
                      <li key={note} className="grid grid-cols-[2rem_minmax(0,1fr)_3rem] items-center gap-3">
                        <span className="text-sm font-medium tabular-nums text-foreground text-right">{note}</span>
                        <ProgressBar value={count} max={distribution.scored} label={`Nota ${note}: ${count}`} />
                        <span className="text-xs text-muted-foreground tabular-nums text-right">{count}</span>
                      </li>
                    );
                  })}
                </ul>
              </SectionCard>
            )}

            {pending.length > 0 && (
              <section className="space-y-3">
                <SectionHeader
                  title="Sessões realizadas sem NPS respondido"
                  description="O convite fica disponível no app do membro até ele responder."
                />
                <SectionCard padding="none" className="max-h-80 overflow-y-auto">
                  {pending.map((p, index) => (
                    <ListRow
                      key={p.booking_id}
                      last={index === pending.length - 1}
                      leading={<DateBlock date={p.date} tone="muted" />}
                      title={p.liberty_name}
                      subtitle={`${p.session_name} · ${p.mentor_name}`}
                      trailing={<StatusPill tone="pending">Sem resposta</StatusPill>}
                    />
                  ))}
                </SectionCard>
              </section>
            )}

            <section className="space-y-3">
              <SectionHeader title="Respostas" description="Toque em uma resposta para ver todas as notas e comentários." />
              {rows.length === 0 ? (
                <EmptyState
                  icon={ClipboardCheck}
                  title="Nenhuma resposta de NPS registrada ainda"
                  description="As respostas aparecem aqui assim que os membros preencherem a pesquisa."
                />
              ) : (
                <SectionCard padding="none">
                  {rows.map((r, index) => (
                    <ListRow
                      key={r.id}
                      last={index === rows.length - 1}
                      onPress={() => setExpanded(r.id)}
                      leading={<DateBlock date={r.created_at.slice(0, 10)} />}
                      title={r.liberty_name || "Membro"}
                      subtitle={`${r.session_name || "Sem dados"} · ${r.mentor_name || "Sem dados"}`}
                      trailing={
                        <>
                          <span className="hidden sm:inline text-xs text-muted-foreground tabular-nums">
                            {format(parseISO(r.created_at), "dd/MM · HH:mm", { locale: ptBR })}
                          </span>
                          <StatusPill tone={scoreTone(r.score_overall)} withDot={false} size="md">
                            {r.score_overall != null ? `Nota ${r.score_overall}` : "Sem nota"}
                          </StatusPill>
                        </>
                      }
                    />
                  ))}
                </SectionCard>
              )}
            </section>
          </>
        )}
      </PageContainer>

      <BottomSheet
        open={expanded !== null}
        onOpenChange={(open) => !open && setExpanded(null)}
        title={openResponse?.liberty_name || "Resposta de NPS"}
        description={
          openResponse
            ? `${openResponse.session_name || "Sem dados"} · ${openResponse.mentor_name || "Sem dados"} · ${format(parseISO(openResponse.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
            : undefined
        }
        size="lg"
      >
        {openResponse && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {scoreLabels.map((s) => {
                const value = openResponse[s.key] as number | null;
                return (
                  <SectionCard key={s.key} padding="compact">
                    <Stat size="sm" label={s.label} value={value ?? "Sem dados"} tone={statTone(value) === "danger" ? "danger" : "default"} />
                  </SectionCard>
                );
              })}
            </div>
            <ResponseField label="Maior chave da sessão" value={openResponse.key_takeaway} />
            <ResponseField label="Sugestões de melhoria" value={openResponse.improvements} />
            <ResponseField label="Indicaria a mentoria?" value={openResponse.would_recommend} />
          </div>
        )}
      </BottomSheet>
    </AppLayout>
  );
};

const ResponseField = ({ label, value }: { label: string; value: string | null }) => (
  <div>
    <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
      {value || <span className="text-muted-foreground">Sem resposta</span>}
    </p>
  </div>
);

export default AdminNps;
