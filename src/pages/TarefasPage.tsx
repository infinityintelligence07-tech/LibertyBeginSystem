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


const statusChips: { key: TaskStatus | "all"; label: string; classes: string }[] = [
  { key: "all", label: "Todas", classes: "border-border text-muted-foreground" },
  { key: "pending", label: "Pendentes", classes: "border-muted-foreground/30 text-muted-foreground" },
  { key: "in_progress", label: "Em andamento", classes: "border-status-blue/30 text-status-blue" },
  { key: "done_by_student", label: "Aguardando validação", classes: "border-status-yellow/30 text-status-yellow" },
  { key: "validated", label: "Concluídas", classes: "border-status-green/30 text-status-green" },
];

interface TarefasPageProps { role: "mentor" | "liberty" }

const TarefasPage = ({ role }: TarefasPageProps) => {
  const { profile } = useAuth();
  const { demoEnabled } = useDemoData();
  const [filter, setFilter] = useState<TaskStatus | "all">("pending");
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
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

  return (
    <AppLayout role={role}>
      <div className="max-w-4xl mx-auto space-y-4">
        <div>
          <div className="flex items-center gap-2 text-primary text-[10px] font-semibold uppercase tracking-wider">
            <ListTodo className="h-3.5 w-3.5" /> {role === "mentor" ? "Acompanhamento de tarefas" : "Central de tarefas"}
          </div>
          <h1 className="text-2xl font-semibold text-foreground mt-1">
            {role === "mentor" ? "Tarefas dos meus mentorados" : "Minhas tarefas"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {role === "liberty"
              ? "Todas as tarefas das suas sessões. Organize por status e prazo."
              : "Acompanhe o que cada aluno está fazendo. Filtre por aluno, status e busque por palavra-chave."}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={Clock} label="Pendentes" value={counts.pending} tone="muted" />
          <Stat icon={PlayCircle} label="Em andamento" value={counts.in_progress} tone="blue" />
          <Stat icon={ShieldCheck} label="Aguardando" value={counts.awaiting} tone="yellow" />
          <Stat icon={CheckCircle2} label="Concluídas" value={counts.validated} tone="green" />
        </div>

        {/* Filters row: student (mentor only) + search */}
        <div className="flex flex-col sm:flex-row gap-2">
          {role === "mentor" && (
            <select
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/40 focus:outline-none sm:w-56"
            >
              <option value="all">Todos os alunos ({students.length})</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{shortName(s.name)}</option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarefa por palavra-chave…"
            className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
          />
          {(studentFilter !== "all" || search) && (
            <button
              onClick={() => { setStudentFilter("all"); setSearch(""); }}
              className="text-[11px] px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-foreground/5"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider">
          {statusChips.map((c) => {
            const active = filter === c.key;
            const count = c.key === "all" ? counts.total : c.key === "pending" ? counts.pending : c.key === "in_progress" ? counts.in_progress : c.key === "done_by_student" ? counts.awaiting : counts.validated;
            return (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                className={`px-2.5 py-1 rounded-full border transition-colors ${c.classes} ${active ? "bg-foreground/10 ring-1 ring-foreground/20" : "hover:bg-foreground/5"}`}
              >
                {c.label} <span className="ml-1 font-semibold">{count}</span>
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground text-sm">Carregando…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm italic">Nenhuma tarefa {filter === "all" ? "cadastrada" : "nesse filtro"}.</p>
        ) : (
          <div className="space-y-3">
            {role === "liberty" ? libertyGroups.map(([bookingId, group]) => (
              <section key={bookingId} className="rounded-lg border border-border bg-card/70 p-3 min-w-0 overflow-hidden">
                <div className="mb-3 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{group[0]?.session_name || "Sessão"}</p>
                  {group[0]?.counterpart_name && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">com {shortName(group[0].counterpart_name)}</p>
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
              </section>
            )) : filtered.map((t: any) => {
              const status = getTaskStatus(t);
              const overdue = t.due_date && t.due_date < today && status !== "validated";
              const detailsHref = role === "mentor" && t.counterpart_id ? `/mentor/alunos/${t.counterpart_id}` : null;
              return (
                <div key={t.id} className="rounded-xl border border-border bg-card/70 p-3 flex items-start gap-3">
                  <div className={`w-2 h-2 mt-2 rounded-full shrink-0 ${status === "validated" ? "bg-status-green" : status === "in_progress" ? "bg-status-blue" : status === "done_by_student" ? "bg-status-yellow" : "bg-muted-foreground/40"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{t.description}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      <span>{t.session_name}</span>
                      {t.counterpart_name && (
                        detailsHref
                          ? <Link to={detailsHref} className="text-primary hover:underline">· {shortName(t.counterpart_name)}</Link>
                          : <span>· {shortName(t.counterpart_name)}</span>
                      )}
                      {t.due_date && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border bg-muted/50 text-muted-foreground border-border">
                          <Calendar className="h-2.5 w-2.5" />
                          Prazo {new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                          {overdue && " · vencido"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

const Stat = ({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: "green" | "blue" | "yellow" | "muted" }) => {
  const color = tone === "green" ? "text-status-green" : tone === "blue" ? "text-status-blue" : tone === "yellow" ? "text-status-yellow" : "text-muted-foreground";
  return (
    <div className="glass-card p-3">
      <Icon className={`h-4 w-4 mb-1.5 ${color}`} />
      <p className="text-lg font-semibold text-foreground tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
};

export default TarefasPage;
