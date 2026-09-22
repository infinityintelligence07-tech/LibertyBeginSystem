import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { shortName, initials } from "@/lib/formatName";
import { DIAGNOSTICO_BEGIN_PILLARS, overallScore } from "@/lib/diagnosticoBegin";
import { Radar as RadarIcon, Plus, Search, ChevronRight, Loader2, CheckCircle2, Clock, Wrench, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";



const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const MentorFerramentasPage = ({ role = "mentor" }: { role?: "mentor" | "admin" }) => {
  const { profile } = useAuth();
  const isAdmin = role === "admin";
  const base = isAdmin ? "/admin/ferramentas" : "/mentor/ferramentas";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [phase, setPhase] = useState<"inicial" | "final">("inicial");
  const [templateId, setTemplateId] = useState("");
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "in_progress">("all");


  const { data: templates = [] } = useQuery({
    queryKey: ["tool-templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tool_templates")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      return data || [];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["tools-members"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_tool_members");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });


  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["tool-applications"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tool_applications")
        .select("*")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const memberById = useMemo(() => {
    const m = new Map<string, any>();
    members.forEach((x: any) => m.set(x.id, x));
    return m;
  }, [members]);

  const filtered = useMemo(() => {
    const q = norm(search);
    if (!q) return applications;
    return applications.filter((a: any) => {
      const m = memberById.get(a.member_id);
      return norm(m?.full_name || "").includes(q) || norm(m?.company_name || "").includes(q);
    });
  }, [applications, search, memberById]);

  // Agrupa as aplicações por aluno para evitar a lista corrida gigante.
  const grouped = useMemo(() => {
    const map = new Map<string, { memberId: string; name: string; company: string | null; items: any[] }>();
    filtered
      .filter((a: any) =>
        statusFilter === "all"
          ? true
          : statusFilter === "completed"
            ? a.status === "completed"
            : a.status !== "completed",
      )
      .forEach((a: any) => {
        const m = memberById.get(a.member_id);
        const key = a.member_id;
        if (!map.has(key)) {
          map.set(key, {
            memberId: key,
            name: m?.full_name || "Membro",
            company: m?.company_name || null,
            items: [],
          });
        }
        map.get(key)!.items.push(a);
      });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [filtered, memberById, statusFilter]);

  const create = useMutation({
    mutationFn: async () => {
      if (!memberId || !templateId) throw new Error("Selecione a ferramenta e o aluno.");
      const { data, error } = await supabase
        .from("tool_applications")
        .insert({
          template_id: templateId,
          member_id: memberId,
          applied_by: profile?.id ?? null,
          phase,
          status: "in_progress",
          answers: {},
          scores: {},
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["tool-applications"] });
      setOpen(false);
      setMemberId("");
      navigate(`${base}/${data.id}`);
    },
    onError: (e: any) => toast.error(e.message || "Não foi possível iniciar a aplicação."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tool_applications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tool-applications"] });
      setToDelete(null);
      toast.success("Aplicação excluída. Nada fica visível para o aluno.");
    },
    onError: (e: any) => toast.error(e.message || "Não foi possível excluir."),
  });

  const openNew = () => {
    setTemplateId(templates[0]?.id || "");
    setPhase("inicial");
    setOpen(true);
  };

  return (
    <AppLayout role={role}>
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUpItem} className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Ferramentas</h1>
            <p className="text-muted-foreground text-sm">
              {isAdmin
                ? "Acompanhe os diagnósticos aplicados pelos mentores."
                : "Aplique uma ferramenta junto com o aluno durante a sessão."}
            </p>
          </div>
          {!isAdmin && (
            <button onClick={openNew} className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
              <Plus className="h-4 w-4" /> Aplicar ferramenta
            </button>
          )}
        </motion.div>

        {/* Catálogo — capa destacada da ferramenta */}
        <motion.div variants={fadeUpItem} className="grid gap-3">
          {templates.map((t: any) => {
            const count = applications.filter((a: any) => a.template_id === t.id).length;
            const done = applications.filter((a: any) => a.template_id === t.id && a.status === "completed").length;
            return (
              <button
                key={t.id}
                onClick={() => navigate(`${base}/modelo`)}
                className="relative overflow-hidden glass-card p-6 text-left hover:border-primary/40 transition-colors group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-transparent pointer-events-none" />
                <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
                  <div className="h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
                    <RadarIcon className="h-7 w-7 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-primary font-semibold mb-1">Ferramenta</p>
                    <p className="text-lg font-semibold text-foreground leading-tight">{t.name}</p>
                    <p className="text-xs text-muted-foreground leading-snug mt-1 max-w-xl">{t.description}</p>
                  </div>
                  <div className="flex items-center gap-6 sm:border-l sm:border-border sm:pl-6 shrink-0">
                    <div>
                      <p className="text-2xl font-semibold text-foreground tabular-nums leading-none">{count}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Aplicações</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-status-green tabular-nums leading-none">{done}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Concluídas</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-foreground tabular-nums leading-none">{DIAGNOSTICO_BEGIN_PILLARS.length}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Pilares</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all" />
                  </div>
                </div>
              </button>
            );
          })}

        </motion.div>


        {/* Aplicações agrupadas por aluno — grid, sem lista corrida */}
        <motion.div variants={fadeUpItem} className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por aluno ou empresa..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center gap-1">
              {([
                { key: "all", label: "Todos" },
                { key: "completed", label: "Concluídos" },
                { key: "in_progress", label: "Em preenchimento" },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    statusFilter === f.key
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-card text-muted-foreground border-border hover:border-primary/20"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : grouped.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="Nenhuma aplicação por aqui"
              description="Aplique uma ferramenta durante a sessão para o diagnóstico aparecer nesta área."
            />
          ) : (
            <div className="glass-card divide-y divide-border overflow-hidden">
              {grouped.map((g) => (
                <div key={g.memberId} className="p-4 sm:p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
                      {initials(g.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{shortName(g.name)}</p>
                      {g.company && (
                        <p className="text-[11px] text-muted-foreground truncate">{g.company}</p>
                      )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                      {g.items.length} {g.items.length === 1 ? "aplicação" : "aplicações"}
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {g.items.map((a: any) => {
                      const done = a.status === "completed";
                      const total = overallScore(a.scores || {});
                      const pct = Math.min(100, Math.round((total / 5) * 100));
                      return (
                        <div
                          key={a.id}
                          className="rounded-xl border border-border bg-background/40 p-3"
                        >
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigate(`${base}/${a.id}`)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="text-xs font-medium text-foreground truncate">
                                {a.phase === "final" ? "Diagnóstico final" : "Diagnóstico inicial"}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(a.created_at).toLocaleDateString("pt-BR")}
                              </p>
                            </button>
                            {done ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-green/10 text-status-green flex items-center gap-1 shrink-0">
                                <CheckCircle2 className="h-3 w-3" /> {total.toFixed(1)}/5
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1 shrink-0">
                                <Clock className="h-3 w-3" /> Preenchendo
                              </span>
                            )}
                            <button
                              onClick={() => setToDelete(a)}
                              aria-label="Excluir aplicação"
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {done && (
                            <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-status-green" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

          )}
        </motion.div>


      </motion.div>
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta aplicação?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as respostas e o resultado serão apagados definitivamente e nada ficará visível
              para o aluno.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) remove.mutate(toDelete.id);
              }}
            >
              {remove.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aplicar ferramenta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Ferramenta</label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Aluno</label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {members.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {shortName(m.full_name)}{m.company_name ? ` · ${m.company_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Momento</label>
              <Select value={phase} onValueChange={(v) => setPhase(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inicial">Diagnóstico inicial (kickoff)</SelectItem>
                  <SelectItem value="final">Diagnóstico final (encerramento)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <button
              disabled={create.isPending}
              onClick={() => create.mutate()}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-60"
            >
              {create.isPending ? "Iniciando..." : "Iniciar preenchimento"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>

  );
};

export default MentorFerramentasPage;
