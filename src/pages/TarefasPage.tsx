import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getTaskStatus, countByStatus, type TaskStatus } from "@/lib/taskStatus";
import { CheckCircle2, Clock, PlayCircle, ShieldCheck, ListTodo, Calendar } from "lucide-react";
import { shortName } from "@/lib/formatName";
import { Link } from "react-router-dom";
import { TaskChecklist } from "@/components/TaskChecklist";
import { useDemoData } from "@/contexts/DemoDataContext";
import {
  demoBookingsForMember, demoBookingsForMentor, demoTasksForBookings,
  demoMentorProfiles, demoLibertyProfiles, demoSessionsCatalog,
} from "@/lib/demoForUser";
import { Button } from "@/components/ui/button";
import {
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  SelectField,
  Stat,
  StatusPill,
  TextField,
} from "@/components/ds";


const statusChips: { key: TaskStatus | "all"; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendentes" },
  { key: "in_progress", label: "Em andamento" },
  { key: "done_by_student", label: "Aguardando validação" },
  { key: "validated", label: "Concluídas" },
];

const taskStatusTone = (status: TaskStatus): "success" | "info" | "warning" | "neutral" => {
  switch (status) {
    case "validated":
      return "success";
    case "in_progress":
      return "info";
    case "done_by_student":
      return "warning";
    case "pending":
      return "neutral";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
};

interface TarefasPageProps { role: "mentor" | "liberty" }

const TarefasPage = ({ role }: TarefasPageProps) => {
  const { profile } = useAuth();
  const { demoEnabled } = useDemoData();
  const [filter, setFilter] = useState<TaskStatus | "all">("pending");
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["all-tasks-scoped", role, profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      // Scope: for liberty student, get all tasks in their bookings.
      // For mentor, tasks in bookings where they are mentor.
      const col = role === "liberty" ? "liberty_id" : "mentor_id";
      const { data: bookings = [] } = await supabase
        .from("bookings")
        .select("id, session_id, scheduled_date, mentor_id, liberty_id")
        .eq(col, profile!.id);
      const bIds = (bookings || []).map((b) => b.id);
      if (bIds.length === 0) return [] as any[];
      const [{ data: tasks = [] }, { data: sessions = [] }, { data: profiles = [] }] = await Promise.all([
        supabase.from("session_tasks").select("*").in("booking_id", bIds).order("due_date", { ascending: true, nullsFirst: false }),
        supabase.from("sessions").select("id, name"),
        supabase.from("profiles").select("id, full_name").in("id", [
          ...new Set([...(bookings || []).map((b: any) => b.mentor_id), ...(bookings || []).map((b: any) => b.liberty_id)].filter(Boolean)),
        ]),
      ]);
      const sessionMap = Object.fromEntries((sessions || []).map((s: any) => [s.id, s.name]));
      const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.full_name]));
      const bookingMap = Object.fromEntries((bookings || []).map((b: any) => [b.id, b]));
      return (tasks || []).map((t: any) => {
        const b = bookingMap[t.booking_id];
        return {
          ...t,
          session_name: sessionMap[b?.session_id] || "Sessão",
          scheduled_date: b?.scheduled_date,
          counterpart_name: role === "liberty" ? profileMap[b?.mentor_id] : profileMap[b?.liberty_id],
          counterpart_id: role === "liberty" ? b?.mentor_id : b?.liberty_id,
        };
      });
    },
  });

  // Demo overlay
  const demoRows = useMemo(() => {
    if (!demoEnabled || !profile?.id) return [] as any[];
    const bks = role === "liberty" ? demoBookingsForMember(profile.id) : demoBookingsForMentor(profile.id);
    const tks = demoTasksForBookings(bks);
    const bookingMap = Object.fromEntries(bks.map((b) => [b.id, b]));
    const sessionMap = Object.fromEntries(demoSessionsCatalog.map((s) => [s.id, s.name]));
    const profileMap = Object.fromEntries(
      [...demoMentorProfiles, ...demoLibertyProfiles].map((p) => [p.id, p.full_name])
    );
    // Add a couple of upcoming tasks with due dates for demonstration
    const addDaysISO = (n: number) => {
      const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
    };
    return tks.map((t, i) => {
      const b = bookingMap[t.booking_id];
      return {
        ...t,
        due_date: (t as any).due_date ?? (i % 3 === 0 ? addDaysISO((i % 5) - 1) : null),
        session_name: sessionMap[b?.session_id] || "Sessão",
        scheduled_date: b?.scheduled_date,
        counterpart_name: role === "liberty"
          ? (profileMap[b?.mentor_id] || "Mentor")
          : (profileMap[b?.liberty_id] || "Aluno"),
        counterpart_id: role === "liberty" ? b?.mentor_id : b?.liberty_id,
      };
    });
  }, [demoEnabled, profile?.id, role]);

  const effectiveRows = demoEnabled ? [...rows, ...demoRows] : rows;

  // Student list (mentor-only) — unique counterparts across bookings
  const students = useMemo(() => {
    if (role !== "mentor") return [];
    const map = new Map<string, string>();
    effectiveRows.forEach((t: any) => {
      if (t.counterpart_id) map.set(t.counterpart_id, t.counterpart_name || "Aluno");
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [effectiveRows, role]);

  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const searchNorm = norm(search.trim());

  const scopedRows = useMemo(() => {
    return effectiveRows.filter((t: any) => {
      if (role === "mentor" && studentFilter !== "all" && t.counterpart_id !== studentFilter) return false;
      if (searchNorm && !norm(String(t.description || "")).includes(searchNorm)) return false;
      return true;
    });
  }, [effectiveRows, role, studentFilter, searchNorm]);

  const counts = useMemo(() => countByStatus(scopedRows), [scopedRows]);
  const filtered = useMemo(() => scopedRows.filter((t: any) => filter === "all" || getTaskStatus(t) === filter), [scopedRows, filter]);
  const libertyGroups = useMemo(() => {
    if (role !== "liberty") return [];
    const groups = new Map<string, any[]>();
    filtered.forEach((task: any) => {
      const current = groups.get(task.booking_id) || [];
      current.push(task);
      groups.set(task.booking_id, current);
    });
    return Array.from(groups.entries());
  }, [filtered, role]);

  const today = new Date().toISOString().slice(0, 10);

  const hasActiveFilters = studentFilter !== "all" || search.length > 0;

  return (
    <AppLayout role={role}>
      <PageContainer>
        <PageHeader
          eyebrow={role === "mentor" ? "Acompanhamento de tarefas" : "Central de tarefas"}
          title={role === "mentor" ? "Tarefas dos meus mentorados" : "Minhas tarefas"}
          description={
            role === "liberty"
              ? "Todas as tarefas das suas sessões. Organize por status e prazo."
              : "Acompanhe o que cada aluno está fazendo. Filtre por aluno, status e busque por palavra-chave."
          }
        />

        {isError && <ErrorState compact onRetry={() => refetch()} />}

        {isLoading ? (
          <LoadingState variant="stats" rows={4} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SectionCard padding="compact"><Stat icon={Clock} label="Pendentes" value={counts.pending} size="sm" /></SectionCard>
            <SectionCard padding="compact"><Stat icon={PlayCircle} label="Em andamento" value={counts.in_progress} size="sm" /></SectionCard>
            <SectionCard padding="compact"><Stat icon={ShieldCheck} label="Aguardando" value={counts.awaiting} size="sm" /></SectionCard>
            <SectionCard padding="compact"><Stat icon={CheckCircle2} label="Concluídas" value={counts.validated} size="sm" /></SectionCard>
          </div>
        )}

        {/* Filtros: aluno (só mentor) + busca */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          {role === "mentor" && (
            <SelectField
              label="Aluno"
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              containerClassName="sm:w-56"
            >
              <option value="all">Todos os alunos ({students.length})</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{shortName(s.name)}</option>
              ))}
            </SelectField>
          )}
          <TextField
            type="search"
            label="Buscar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarefa por palavra-chave"
            containerClassName="flex-1"
          />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="sm:h-11" onClick={() => { setStudentFilter("all"); setSearch(""); }}>
              Limpar filtros
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por status">
          {statusChips.map((c) => {
            const count = c.key === "all" ? counts.total : c.key === "pending" ? counts.pending : c.key === "in_progress" ? counts.in_progress : c.key === "done_by_student" ? counts.awaiting : counts.validated;
            return (
              <Chip key={c.key} active={filter === c.key} onClick={() => setFilter(c.key)} count={count}>
                {c.label}
              </Chip>
            );
          })}
        </div>

        {isLoading ? (
          <LoadingState variant="list" rows={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title={filter === "all" ? "Nenhuma tarefa cadastrada" : "Nenhuma tarefa nesse filtro"}
            description={
              filter === "all"
                ? "As tarefas combinadas nas sessões aparecem aqui."
                : "Escolha outro status ou limpe os filtros para ver todas."
            }
            action={
              filter !== "all" || hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={() => { setFilter("all"); setStudentFilter("all"); setSearch(""); }}>
                  Ver todas
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {role === "liberty" ? libertyGroups.map(([bookingId, group]) => (
              <SectionCard key={bookingId} as="section" padding="compact" className="min-w-0 overflow-hidden">
                <div className="mb-3 min-w-0">
                  <h2 className="text-[15px] font-semibold text-foreground truncate">{group[0]?.session_name || "Sessão"}</h2>
                  {group[0]?.counterpart_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">com {shortName(group[0].counterpart_name)}</p>
                  )}
                </div>
                <TaskChecklist
                  tasks={group}
                  bookingId={bookingId}
                  role="liberty"
                  sessionName={group[0]?.session_name}
                  hideAdd
                  invalidateKeys={[["all-tasks-scoped", role, profile?.id]]}
                />
              </SectionCard>
            )) : (
              <SectionCard padding="none">
                <ul className="list-none m-0 p-0 divide-y divide-border">
                  {filtered.map((t: any) => {
                    const status = getTaskStatus(t);
                    const overdue = t.due_date && t.due_date < today && status !== "validated";
                    const detailsHref = role === "mentor" && t.counterpart_id ? `/mentor/alunos/${t.counterpart_id}` : null;
                    return (
                      <li key={t.id} className="flex items-start gap-3 px-4 py-3 min-h-[56px]">
                        <StatusPill tone={taskStatusTone(status)} size="sm" className="mt-0.5 shrink-0">
                          {statusChips.find((c) => c.key === status)?.label ?? status}
                        </StatusPill>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">{t.description}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{t.session_name}</span>
                            {t.counterpart_name && (
                              detailsHref
                                ? <Link to={detailsHref} className="text-primary hover:underline">· {shortName(t.counterpart_name)}</Link>
                                : <span>· {shortName(t.counterpart_name)}</span>
                            )}
                            {t.due_date && (
                              <span className={overdue ? "inline-flex items-center gap-1 text-destructive" : "inline-flex items-center gap-1"}>
                                <Calendar className="h-3 w-3" aria-hidden />
                                Prazo {new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                                {overdue && " · vencido"}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </SectionCard>
            )}
          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
};

export default TarefasPage;
