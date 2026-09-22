import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useMembers } from "@/hooks/useAdminData";
import { EmptyState } from "@/components/EmptyState";
import { UserAvatar } from "@/components/UserAvatar";
import { shortName } from "@/lib/formatName";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CalendarClock, AlertTriangle, Save, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_PT[m - 1]} ${y}`;
};

const memberPace = (member: any, key: string) => {
  const count = member.monthly_counts?.[key] || 0;
  if (count >= 2) return { label: "No ritmo", card: "border-status-green/35 bg-status-green/10", badge: "bg-status-green/15 text-status-green" };
  if (count === 1) return { label: "Parcial", card: "border-status-yellow/40 bg-status-yellow/10", badge: "bg-status-yellow/15 text-status-yellow" };
  return { label: "Sem sessão", card: "border-destructive/35 bg-destructive/10", badge: "bg-destructive/15 text-destructive" };
};

const AdminEncerramentosPage = () => {
  const { data: members, isLoading } = useMembers();
  const queryClient = useQueryClient();
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

  return (
    <AppLayout role="admin">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <CalendarClock className="h-6 w-6 text-primary" />
              Encerramentos do Programa
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visão Kanban mês a mês de quando cada membro <strong>Begin</strong> conclui o programa. Membros Liberty não expiram e ficam de fora.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => shift(-1)} className="h-9 px-2">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium min-w-[220px] text-center px-3 py-2 rounded-lg bg-muted capitalize">
              {monthLabel(monthKeys[0])} → {monthLabel(monthKeys[monthKeys.length - 1])}
            </div>
            <Button variant="outline" size="sm" onClick={() => shift(1)} className="h-9 px-2">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAnchor(new Date(now.getFullYear(), now.getMonth(), 1))}
            >
              Hoje
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <>
            {/* Kanban */}
            <div className="overflow-x-auto pb-2">
              <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-4 min-w-full">
                {monthKeys.map((key) => {
                  const items = grouped[key] || [];
                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-border bg-card/50 flex flex-col min-h-[300px]"
                    >
                      <div className="px-4 py-3 border-b border-border flex items-center justify-between sticky top-0 bg-card/80 backdrop-blur rounded-t-xl">
                        <div>
                          <div className="text-sm font-semibold capitalize">{monthLabel(key)}</div>
                          <div className="text-xs text-muted-foreground">
                            {items.length} {items.length === 1 ? "membro" : "membros"}
                          </div>
                        </div>
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                          {items.length}
                        </div>
                      </div>
                      <div className="p-3 space-y-2 flex-1">
                        {items.length === 0 ? (
                          <div className="text-xs text-muted-foreground text-center py-8">
                            Nenhum encerramento
                          </div>
                        ) : (
                          items.map((m) => {
                            const day = (m.program_end_date || "").slice(8, 10);
                            const pace = memberPace(m, key);
                            return (
                              <Link
                                key={m.id}
                                to={`/admin/membros/${m.id}/editar`}
                                className={`block rounded-lg border hover:shadow-sm transition-all p-3 ${pace.card}`}
                              >
                                <div className="flex items-center gap-3">
                                  <UserAvatar
                                    name={m.full_name}
                                    avatarUrl={m.avatar_url || undefined}
                                    size={36}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium truncate">
                                      {shortName(m.full_name)}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {m.company_name || "Sem dados"}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[10px] uppercase text-muted-foreground">Dia</div>
                                    <div className="text-sm font-semibold text-primary">{day}</div>
                                  </div>
                                </div>
                                <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                                  <span className={`px-2 py-0.5 rounded-full font-medium ${pace.badge}`}>
                                    {pace.label}
                                  </span>
                                  {!m.has_next_session && (
                                    <span className="px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">Sem próxima sessão</span>
                                  )}
                                  <span className="text-muted-foreground">
                                    {m.total_completed}/12 sessões
                                  </span>
                                </div>
                              </Link>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {outOfWindow.length > 0 && (
              <div className="text-xs text-muted-foreground">
                + {outOfWindow.length} membro(s) encerram fora deste período. Use as setas para navegar.
              </div>
            )}

            {/* Missing dates */}
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5">
              <div className="px-4 py-3 border-b border-amber-500/20 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold">
                  Sem datas definidas ({missing.length})
                </h2>
              </div>
              {missing.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={CalendarClock}
                    title="Todos os membros com datas!"
                    description="Nenhum membro sem data de início ou término."
                  />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {missing.map((m) => {
                    const d = drafts[m.id] || {
                      start: m.program_start_date || "",
                      end: m.program_end_date || "",
                    };
                    const dirty = !!drafts[m.id];
                    return (
                      <div key={m.id} className="p-3 flex flex-col md:flex-row md:items-center gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <UserAvatar name={m.full_name} avatarUrl={m.avatar_url || undefined} size={36} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{shortName(m.full_name)}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {m.company_name || m.email || "Sem dados"}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="text-xs text-muted-foreground flex flex-col">
                            Início
                            <input
                              type="date"
                              value={d.start}
                              onChange={(e) => setDraft(m.id, { start: e.target.value })}
                              className="mt-1 h-9 rounded-md border border-border bg-background px-2 text-sm"
                            />
                          </label>
                          <label className="text-xs text-muted-foreground flex flex-col">
                            Término
                            <input
                              type="date"
                              value={d.end}
                              onChange={(e) => setDraft(m.id, { end: e.target.value })}
                              className="mt-1 h-9 rounded-md border border-border bg-background px-2 text-sm"
                            />
                          </label>
                          <Button
                            size="sm"
                            onClick={() => saveDates(m.id)}
                            disabled={!dirty || savingId === m.id}
                            className="h-9 mt-4"
                          >
                            <Save className="h-3.5 w-3.5 mr-1" />
                            {savingId === m.id ? "Salvando…" : "Salvar"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default AdminEncerramentosPage;
