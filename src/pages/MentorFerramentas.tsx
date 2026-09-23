import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { shortName } from "@/lib/formatName";
import { DIAGNOSTICO_BEGIN_PILLARS, overallScore } from "@/lib/diagnosticoBegin";
import { Radar as RadarIcon, Plus, Search, ChevronRight, Loader2, Wrench, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import {
  BottomSheet,
  Chip,
  ConfirmDialog,
  EmptyState,
  IconButton,
  ListRow,
  LoadingState,
  PageContainer,
  PageHeader,
  ProgressBar,
  SectionCard,
  SectionHeader,
  SelectField,
  Stat,
  StatusPill,
  TextField,
} from "@/components/ds";



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

  const statusFilters = [
    { key: "all", label: "Todos", count: filtered.length },
    { key: "completed", label: "Concluídos", count: filtered.filter((a: any) => a.status === "completed").length },
    { key: "in_progress", label: "Em preenchimento", count: filtered.filter((a: any) => a.status !== "completed").length },
  ] as const;

  const totalApplications = grouped.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <AppLayout role={role}>
      <PageContainer>
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6 lg:space-y-8">
        <motion.div variants={fadeUpItem}>
          <PageHeader
            title="Ferramentas"
            description={
              isAdmin
                ? "Acompanhe os diagnósticos aplicados pelos mentores."
                : "Aplique uma ferramenta junto com o aluno durante a sessão."
            }
            actions={
              !isAdmin ? (
                <Button onClick={openNew}>
                  <Plus /> Aplicar ferramenta
                </Button>
              ) : undefined
            }
          />
        </motion.div>

        {/* Catálogo de ferramentas */}
        <motion.section variants={fadeUpItem} className="space-y-3">
          <SectionHeader title="Catálogo" description="Toque para ver o modelo completo e os pilares avaliados." />
          <div className="grid gap-3">
            {templates.map((t: any) => {
              const count = applications.filter((a: any) => a.template_id === t.id).length;
              const done = applications.filter((a: any) => a.template_id === t.id && a.status === "completed").length;
              return (
                <SectionCard
                  key={t.id}
                  as="button"
                  interactive
                  onClick={() => navigate(`${base}/modelo`)}
                  className="text-left"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
                    <div className="h-12 w-12 rounded-[var(--ds-radius-md)] bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <RadarIcon className="h-6 w-6" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-primary mb-0.5">Ferramenta</p>
                      <p className="text-base font-semibold text-foreground leading-tight">{t.name}</p>
                      <p className="text-sm text-muted-foreground leading-snug mt-1 max-w-xl">{t.description}</p>
                    </div>
                    <div className="flex items-center gap-5 sm:gap-6 sm:border-l sm:border-border sm:pl-6 shrink-0">
                      <Stat size="sm" label="Aplicações" value={count} />
                      <Stat size="sm" label="Concluídas" value={done} tone="success" />
                      <Stat size="sm" label="Pilares" value={DIAGNOSTICO_BEGIN_PILLARS.length} />
                      <ChevronRight className="h-5 w-5 text-muted-foreground hidden sm:block" aria-hidden />
                    </div>
                  </div>
                </SectionCard>
              );
            })}
          </div>
        </motion.section>

        {/* Aplicações agrupadas por aluno */}
        <motion.section variants={fadeUpItem} className="space-y-4">
          <SectionHeader
            title="Aplicações"
            description={
              totalApplications > 0
                ? `${totalApplications} ${totalApplications === 1 ? "aplicação" : "aplicações"} em ${grouped.length} ${grouped.length === 1 ? "aluno" : "alunos"}`
                : undefined
            }
          />
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
              <TextField
                type="search"
                aria-label="Buscar por aluno ou empresa"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por aluno ou empresa..."
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              {statusFilters.map((f) => (
                <Chip
                  key={f.key}
                  active={statusFilter === f.key}
                  onClick={() => setStatusFilter(f.key)}
                  count={f.count}
                >
                  {f.label}
                </Chip>
              ))}
            </div>
          </div>

          {isLoading ? (
            <LoadingState variant="list" rows={4} />
          ) : grouped.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title={search || statusFilter !== "all" ? "Nenhuma aplicação com esses filtros" : "Nenhuma aplicação por aqui"}
              description={
                search || statusFilter !== "all"
                  ? "Ajuste a busca ou o filtro para ver outras aplicações."
                  : "Aplique uma ferramenta durante a sessão para o diagnóstico aparecer nesta área."
              }
              action={
                search || statusFilter !== "all" ? (
                  <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                    Limpar filtros
                  </Button>
                ) : !isAdmin ? (
                  <Button size="sm" onClick={openNew}><Plus /> Aplicar ferramenta</Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-4">
              {grouped.map((g) => (
                <SectionCard key={g.memberId} padding="none" as="article">
                  <header className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-border">
                    <UserAvatar name={g.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{shortName(g.name)}</p>
                      {g.company && <p className="text-xs text-muted-foreground truncate">{g.company}</p>}
                    </div>
                    <StatusPill tone="neutral" withDot={false}>
                      {g.items.length} {g.items.length === 1 ? "aplicação" : "aplicações"}
                    </StatusPill>
                  </header>
                  <ul>
                    {g.items.map((a: any, idx: number) => {
                      const done = a.status === "completed";
                      const total = overallScore(a.scores || {});
                      return (
                        <li key={a.id} className="flex items-center gap-1 pr-2">
                          <div className="min-w-0 flex-1">
                            <ListRow
                              title={a.phase === "final" ? "Diagnóstico final" : "Diagnóstico inicial"}
                              subtitle={
                                <span className="flex flex-col gap-1.5">
                                  <span>{new Date(a.created_at).toLocaleDateString("pt-BR")}</span>
                                  {done && <ProgressBar value={total} max={5} tone="success" className="max-w-[160px]" />}
                                </span>
                              }
                              trailing={
                                done ? (
                                  <StatusPill tone="success">Concluído · {total.toFixed(1)}/5</StatusPill>
                                ) : (
                                  <StatusPill tone="neutral">Em preenchimento</StatusPill>
                                )
                              }
                              onPress={() => navigate(`${base}/${a.id}`)}
                              last={idx === g.items.length - 1}
                            />
                          </div>
                          <IconButton
                            aria-label="Excluir aplicação"
                            size="sm"
                            onClick={() => setToDelete(a)}
                            className="shrink-0 hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </li>
                      );
                    })}
                  </ul>
                </SectionCard>
              ))}
            </div>
          )}
        </motion.section>
      </motion.div>
      </PageContainer>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => { if (!o && !remove.isPending) setToDelete(null); }}
        title="Excluir esta aplicação?"
        description="Todas as respostas e o resultado serão apagados definitivamente e nada ficará visível para o aluno."
        confirmLabel="Excluir"
        destructive
        loading={remove.isPending}
        onConfirm={() => { if (toDelete) remove.mutate(toDelete.id); }}
      />

      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Aplicar ferramenta"
        description="Escolha a ferramenta, o aluno e o momento. O preenchimento abre em seguida."
        size="sm"
        locked={create.isPending}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>Cancelar</Button>
            <Button disabled={create.isPending || !memberId || !templateId} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="animate-spin" />}
              {create.isPending ? "Iniciando..." : "Iniciar preenchimento"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField label="Ferramenta" value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
            <option value="" disabled>Selecione</option>
            {templates.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </SelectField>
          <SelectField label="Aluno" value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
            <option value="" disabled>Selecione o aluno</option>
            {members.map((m: any) => (
              <option key={m.id} value={m.id}>
                {shortName(m.full_name)}{m.company_name ? ` · ${m.company_name}` : ""}
              </option>
            ))}
          </SelectField>
          <SelectField label="Momento" value={phase} onChange={(e) => setPhase(e.target.value as "inicial" | "final")}>
            <option value="inicial">Diagnóstico inicial (kickoff)</option>
            <option value="final">Diagnóstico final (encerramento)</option>
          </SelectField>
        </div>
      </BottomSheet>
    </AppLayout>
  );
};

export default MentorFerramentasPage;
