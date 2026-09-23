import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useMembers } from "@/hooks/useAdminData";
import { UserAvatar } from "@/components/UserAvatar";
import { shortName } from "@/lib/formatName";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CalendarClock, AlertTriangle, Save, ChevronLeft, ChevronRight } from "lucide-react";
import {
  PageContainer,
  PageHeader,
  SectionHeader,
  SectionCard,
  ListRow,
  StatusPill,
  IconButton,
  TextField,
  LoadingState,
  EmptyState,
  ErrorState,
} from "@/components/ds";
import type { PillTone } from "@/components/ds";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_PT[m - 1]} ${y}`;
};

const memberPace = (member: any, key: string): { label: string; tone: PillTone } => {
  const count = member.monthly_counts?.[key] || 0;
  if (count >= 2) return { label: "No ritmo", tone: "success" };
  if (count === 1) return { label: "Parcial", tone: "warning" };
  return { label: "Sem sessão", tone: "danger" };
};

const AdminEncerramentosPage = () => {
  const { data: members, isLoading, isError, refetch } = useMembers();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const now = new Date();
  const [anchor, setAnchor] = useState<Date>(new Date(now.getFullYear(), now.getMonth(), 1));
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { start: string; end: string }>>({});

  // Kanban: show 6 months starting from anchor
  const monthKeys = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
      arr.push(monthKey(d));
    }
    return arr;
  }, [anchor]);

  // Membros inativados (encerrados por cancelamento etc.) saem do planejamento:
  // não entram no kanban nem nas pendências — ficam apenas no histórico da aba "Encerrados".
  const beginMembers = (members || []).filter((m) => m.member_tier !== "liberty" && m.is_active !== false);
  const withEnd = beginMembers.filter((m) => !!m.program_end_date);
  const missing = beginMembers.filter((m) => !m.program_start_date || !m.program_end_date);

  const grouped = useMemo(() => {
    const map: Record<string, typeof withEnd> = {};
    monthKeys.forEach((k) => { map[k] = []; });
    withEnd.forEach((m) => {
      const key = (m.program_end_date || "").substring(0, 7);
      if (map[key]) map[key].push(m);
    });
    // sort each column by end date asc
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (a.program_end_date || "").localeCompare(b.program_end_date || ""))
    );
    return map;
  }, [withEnd, monthKeys]);

  // Members ending outside the current window (still shown as counter)
  const outOfWindow = withEnd.filter((m) => !monthKeys.includes((m.program_end_date || "").substring(0, 7)));

  const shift = (delta: number) => {
    setAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const setDraft = (id: string, patch: Partial<{ start: string; end: string }>) => {
    setDrafts((prev) => {
      const cur = prev[id] || {
        start: members?.find((m) => m.id === id)?.program_start_date || "",
        end: members?.find((m) => m.id === id)?.program_end_date || "",
      };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  };

  const saveDates = async (id: string) => {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          program_start_date: d.start || null,
          program_end_date: d.end || null,
        })
        .eq("id", id);
      if (error) throw error;
      toast.success("Datas atualizadas");
      setDrafts((prev) => { const n = { ...prev }; delete n[id]; return n; });
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSavingId(null);
    }
  };

  const currentKey = monthKey(new Date(now.getFullYear(), now.getMonth(), 1));

  return (
    <AppLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Encerramentos do programa"
          description="Visão mês a mês de quando cada membro Begin conclui o programa. Membros Liberty não expiram e ficam de fora."
          actions={
            <>
              <IconButton aria-label="Período anterior" variant="outline" onClick={() => shift(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <span className="hidden md:inline-block text-sm font-medium text-foreground text-center px-3 min-w-[200px]">
                {monthLabel(monthKeys[0])} a {monthLabel(monthKeys[monthKeys.length - 1])}
              </span>
              <IconButton aria-label="Próximo período" variant="outline" onClick={() => shift(1)}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
              <Button variant="ghost" onClick={() => setAnchor(new Date(now.getFullYear(), now.getMonth(), 1))}>
                Hoje
              </Button>
            </>
          }
        />

        <p className="md:hidden text-sm font-medium text-foreground -mt-2">
          {monthLabel(monthKeys[0])} a {monthLabel(monthKeys[monthKeys.length - 1])}
        </p>

        {isLoading ? (
          <LoadingState variant="cards" rows={3} />
        ) : isError ? (
          <ErrorState title="Não foi possível carregar os encerramentos" onRetry={() => refetch()} />
        ) : (
          <>
            <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="grid grid-flow-col auto-cols-[minmax(272px,1fr)] gap-4 min-w-full">
                {monthKeys.map((key) => {
                  const items = grouped[key] || [];
                  const isCurrent = key === currentKey;
                  return (
                    <SectionCard key={key} padding="none" as="section" className="flex flex-col min-h-[300px]" tone={isCurrent ? "brand" : "default"}>
                      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                        <SectionHeader
                          as="h3"
                          title={monthLabel(key)}
                          description={`${items.length} ${items.length === 1 ? "membro" : "membros"}`}
                        />
                        <StatusPill tone={items.length > 0 ? "brand" : "neutral"} withDot={false} size="md">
                          {items.length}
                        </StatusPill>
                      </div>
                      <div className="flex-1">
                        {items.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-10 px-4">Nenhum encerramento</p>
                        ) : (
                          items.map((m, index) => {
                            const day = (m.program_end_date || "").slice(8, 10);
                            const pace = memberPace(m, key);
                            return (
                              <ListRow
                                key={m.id}
                                last={index === items.length - 1}
                                onPress={() => navigate(`/admin/membros/${m.id}/editar`)}
                                leading={<UserAvatar name={m.full_name} avatarUrl={m.avatar_url || undefined} size={40} />}
                                title={shortName(m.full_name)}
                                subtitle={
                                  <span className="flex items-center gap-1.5">
                                    <span className="tabular-nums">Dia {day}</span>
                                    <span aria-hidden>·</span>
                                    <span className="tabular-nums">{m.total_completed}/12 sessões</span>
                                    {m.company_name && (
                                      <>
                                        <span aria-hidden>·</span>
                                        <span className="truncate">{m.company_name}</span>
                                      </>
                                    )}
                                  </span>
                                }
                                trailing={
                                  <span className="flex flex-col items-end gap-1">
                                    <StatusPill tone={pace.tone}>{pace.label}</StatusPill>
                                    {!m.has_next_session && (
                                      <StatusPill tone="danger" withDot={false}>Sem próxima sessão</StatusPill>
                                    )}
                                  </span>
                                }
                              />
                            );
                          })
                        )}
                      </div>
                    </SectionCard>
                  );
                })}
              </div>
            </div>

            {outOfWindow.length > 0 && (
              <p className="text-xs text-muted-foreground">
                + {outOfWindow.length} membro(s) encerram fora deste período. Use as setas para navegar.
              </p>
            )}

            <section className="space-y-3">
              <SectionHeader
                title={`Sem datas definidas (${missing.length})`}
                description="Membros Begin ativos sem data de início ou de término do programa."
              />
              {missing.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  compact
                  title="Todos os membros com datas"
                  description="Nenhum membro sem data de início ou término."
                />
              ) : (
                <SectionCard padding="none" tone="warning">
                  <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm text-status-yellow">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                    <span className="font-medium">Defina as datas para que o membro entre no planejamento.</span>
                  </div>
                  {missing.map((m, index) => {
                    const d = drafts[m.id] || {
                      start: m.program_start_date || "",
                      end: m.program_end_date || "",
                    };
                    const dirty = !!drafts[m.id];
                    const busy = savingId === m.id;
                    return (
                      <div
                        key={m.id}
                        className={`px-4 py-3 flex flex-col md:flex-row md:items-end gap-3 ${index < missing.length - 1 ? "border-b border-border" : ""}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0 md:pb-2">
                          <UserAvatar name={m.full_name} avatarUrl={m.avatar_url || undefined} size={40} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{shortName(m.full_name)}</p>
                            <p className="text-xs text-muted-foreground truncate">{m.company_name || m.email || "Sem dados"}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:flex md:items-end">
                          <TextField
                            label="Início"
                            type="date"
                            value={d.start}
                            onChange={(e) => setDraft(m.id, { start: e.target.value })}
                            containerClassName="md:w-44"
                          />
                          <TextField
                            label="Término"
                            type="date"
                            value={d.end}
                            onChange={(e) => setDraft(m.id, { end: e.target.value })}
                            containerClassName="md:w-44"
                          />
                          <Button
                            size="sm"
                            onClick={() => saveDates(m.id)}
                            disabled={!dirty || busy}
                            className="col-span-2 md:col-span-1 md:mb-1"
                          >
                            <Save aria-hidden />
                            {busy ? "Salvando..." : "Salvar"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </SectionCard>
              )}
            </section>
          </>
        )}
      </PageContainer>
    </AppLayout>
  );
};

export default AdminEncerramentosPage;
