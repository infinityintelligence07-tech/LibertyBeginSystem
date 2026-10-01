import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClipboardCheck, Send, Star, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { shortName } from "@/lib/formatName";
import { whatsappHref } from "@/lib/meetingWhatsApp";
import { isNpsEligibleBooking } from "@/lib/pendingNps";
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

type PendingSession = {
  booking_id: string;
  liberty_id: string;
  liberty_name: string;
  avatar_url: string | null;
  phone: string | null;
  user_id: string | null;
  session_name: string;
  mentor_name: string;
  date: string;
};

type PendingStudent = {
  liberty_id: string;
  liberty_name: string;
  avatar_url: string | null;
  phone: string | null;
  user_id: string | null;
  sessions: PendingSession[];
};

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => {
  const label = format(parseISO(`${key}-01`), "MMMM 'de' yyyy", { locale: ptBR });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const AdminNps = () => {
  const [rows, setRows] = useState<NpsRow[]>([]);
  const [pending, setPending] = useState<PendingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [dispatching, setDispatching] = useState(false);
  const [sendingKey, setSendingKey] = useState<string | null>(null);

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
        .select("id, scheduled_date, start_time, end_time, status, is_retroactive, report_required, session_id, liberty_id, sessions(name, order, is_kickoff), liberty:profiles!bookings_liberty_id_fkey(full_name, phone, avatar_url, user_id), mentor:profiles!bookings_mentor_id_fkey(full_name)")
        .eq("status", "completed")
        .order("scheduled_date", { ascending: false })
        .limit(1000);
      const answeredIds = new Set(answered.map((r) => r.booking_id).filter(Boolean) as string[]);
      setPending(
        (doneBookings || [])
          .filter((b) => b.liberty_id && isNpsEligibleBooking(b, answeredIds))
          .map((b) => ({
            booking_id: b.id,
            liberty_id: b.liberty_id as string,
            liberty_name: b.liberty?.full_name || "Membro",
            avatar_url: b.liberty?.avatar_url ?? null,
            phone: b.liberty?.phone ?? null,
            user_id: b.liberty?.user_id ?? null,
            session_name: b.sessions?.name || "Sessão",
            mentor_name: b.mentor?.full_name || "Sem mentor",
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

  const groupStudents = (items: PendingSession[]): PendingStudent[] => {
    const byMember = new Map<string, PendingStudent>();
    for (const item of items) {
      const current = byMember.get(item.liberty_id);
      if (!current) {
        byMember.set(item.liberty_id, {
          liberty_id: item.liberty_id,
          liberty_name: item.liberty_name,
          avatar_url: item.avatar_url,
          phone: item.phone,
          user_id: item.user_id,
          sessions: [item],
        });
      } else {
        current.sessions.push(item);
      }
    }
    return Array.from(byMember.values()).sort((a, b) => a.liberty_name.localeCompare(b.liberty_name, "pt-BR"));
  };

  const monthStudents = useMemo(() => groupStudents(monthPending), [monthPending]);
  const openStudent = monthStudents.find((student) => student.liberty_id === openStudentId) ?? null;

  const npsLink = (bookingId?: string) =>
    `${window.location.origin}${bookingId ? `/nps/${bookingId}` : "/nps"}`;

  const whatsappText = (student: PendingStudent) => {
    const first = student.liberty_name.split(" ")[0] || "olá";
    const lines = student.sessions.map((session) => {
      const when = session.date ? format(parseISO(session.date), "dd/MM", { locale: ptBR }) : "sem data";
      return `• ${session.session_name} (${when})`;
    });
    return `Oi, ${first}. Falta você preencher o NPS destas sessões:\n\n${lines.join("\n")}\n\nAbra a lista e avalie cada uma. Leva menos de 2 minutos:\n${npsLink()}`;
  };

  const insertInvites = async (
    payload: { user_id: string; message: string; link: string; related_booking_id: string }[],
  ) => {
    if (!payload.length) {
      toast.error("Nenhum destes alunos tem acesso ativado.");
      return false;
    }
    const { error } = await supabase.from("notifications").insert(
      payload.map((item) => ({
        user_id: item.user_id,
        type: "nps_request",
        title: "Pesquisa de satisfação (NPS)",
        message: item.message,
        link: item.link,
        related_booking_id: item.related_booking_id,
      })),
    );
    if (error) throw error;
    return true;
  };

  const dispatchStudents = async (students: PendingStudent[]) => {
    const skipped = students.filter((student) => !student.user_id).length;
    const payload = students
      .filter((student) => student.user_id && student.sessions[0])
      .map((student) => {
        const count = student.sessions.length;
        const first = student.sessions[0];
        return {
          user_id: student.user_id as string,
          related_booking_id: first.booking_id,
          link: "/nps",
          message: count === 1
            ? `Como foi a sessão "${first.session_name}"? Sua opinião leva menos de 2 minutos.`
            : `Você tem ${count} sessões para avaliar. Abra a lista e preencha o NPS de cada uma.`,
        };
      });
    const ok = await insertInvites(payload);
    if (!ok) return;
    toast.success(
      `Convite enviado para ${payload.length} aluno(s)` +
        (skipped > 0 ? `. ${skipped} sem acesso ativado.` : ""),
    );
  };

  const dispatchMonth = async () => {
    if (!monthStudents.length) {
      toast.info("Nenhum aluno pendente nesse mês.");
      return;
    }
    setDispatching(true);
    try {
      await dispatchStudents(monthStudents);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "desconhecido";
      toast.error("Erro no disparo: " + message);
    } finally {
      setDispatching(false);
    }
  };

  const dispatchOne = async (session: PendingSession) => {
    if (!session.user_id) {
      toast.error("Este aluno ainda não tem acesso ativado.");
      return;
    }
    setSendingKey(session.booking_id);
    try {
      const ok = await insertInvites([{
        user_id: session.user_id,
        related_booking_id: session.booking_id,
        link: `/nps/${session.booking_id}`,
        message: `Como foi a sessão "${session.session_name}"? Sua opinião leva menos de 2 minutos.`,
      }]);
      if (ok) toast.success(`NPS enviado para ${session.liberty_name.split(" ")[0]}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "desconhecido";
      toast.error("Erro ao enviar NPS: " + message);
    } finally {
      setSendingKey(null);
    }
  };

  const openResponse = rows.find((r) => r.id === expanded);

  return (
    <AppLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Pesquisas de NPS"
          description="Quem já preencheu o NPS da sessão e quem ainda precisa responder."
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
                <Stat icon={ClipboardCheck} label="Sessões sem NPS" value={pending.length} tone={pending.length > 0 ? "pending" : "default"} />
              </SectionCard>
            </div>

            <SectionCard as="section" className="space-y-4">
              <SectionHeader
                as="h3"
                title="Quem não preencheu"
                description="A lista é de alunos com sessão realizada sem NPS neste mês. O disparo avisa no app. O WhatsApp abre na ficha de cada pessoa."
              />
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end gap-3">
                <SelectField label="Mês" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                  {months.map((m) => (
                    <option key={m} value={m}>{monthLabel(m)}</option>
                  ))}
                </SelectField>
                <div className="px-4 py-2 rounded-ds border border-border bg-card">
                  <Stat size="sm" label="Alunos neste mês" value={monthStudents.length} />
                </div>
                <Button onClick={dispatchMonth} disabled={dispatching || monthStudents.length === 0} className="min-h-11">
                  <Send aria-hidden />
                  {dispatching ? "Enviando..." : `Disparar para ${monthStudents.length}`}
                </Button>
              </div>
            </SectionCard>

            {monthStudents.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                compact
                title="Ninguém pendente neste mês"
                description="Quando uma sessão realizada ficar sem NPS, o aluno aparece aqui."
              />
            ) : (
              <SectionCard padding="none">
                {monthStudents.map((student, index) => {
                  const names = student.sessions.map((session) => session.session_name);
                  const subtitle = names.length === 1
                    ? names[0]
                    : `${names.length} sessões sem avaliação: ${names.join(", ")}`;
                  return (
                    <ListRow
                      key={student.liberty_id}
                      wrap
                      last={index === monthStudents.length - 1}
                      onPress={() => setOpenStudentId(student.liberty_id)}
                      leading={<UserAvatar name={student.liberty_name} avatarUrl={student.avatar_url} size={40} />}
                      title={shortName(student.liberty_name)}
                      subtitle={subtitle}
                      trailing={<StatusPill tone="pending">Sem NPS</StatusPill>}
                    />
                  );
                })}
              </SectionCard>
            )}

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

            <section className="space-y-3">
              <SectionHeader title="Quem preencheu" description="Toque em uma resposta para ver a sessão e as notas." />
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
        open={openStudent !== null}
        onOpenChange={(open) => !open && setOpenStudentId(null)}
        title={openStudent?.liberty_name || "Aluno"}
        description="Sessões realizadas que ainda não têm NPS."
        size="lg"
        footer={
          openStudent ? (
            <>
              {openStudent.sessions.length > 1 && (
                <Button
                  variant="outline"
                  disabled={dispatching || !openStudent.user_id}
                  onClick={async () => {
                    setDispatching(true);
                    try {
                      await dispatchStudents([openStudent]);
                    } catch (e: unknown) {
                      const message = e instanceof Error ? e.message : "desconhecido";
                      toast.error("Erro no disparo: " + message);
                    } finally {
                      setDispatching(false);
                    }
                  }}
                >
                  <Send aria-hidden /> Disparar todas no app
                </Button>
              )}
              {whatsappHref(openStudent.phone, whatsappText(openStudent)) ? (
                <Button asChild>
                  <a href={whatsappHref(openStudent.phone, whatsappText(openStudent)) || "#"} target="_blank" rel="noopener noreferrer">
                    Avisar no WhatsApp
                  </a>
                </Button>
              ) : (
                <Button disabled>Sem telefone no cadastro</Button>
              )}
            </>
          ) : undefined
        }
      >
        {openStudent && (
          <div className="space-y-3">
            {openStudent.sessions.map((session) => (
              <SectionCard key={session.booking_id} padding="compact" className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{session.session_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {session.date ? format(parseISO(session.date), "dd 'de' MMMM", { locale: ptBR }) : "Sem data"}
                    {" · "}
                    {session.mentor_name}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={sendingKey === session.booking_id || !session.user_id}
                  onClick={() => dispatchOne(session)}
                >
                  <Send aria-hidden />
                  {sendingKey === session.booking_id ? "Enviando..." : "Enviar esta sessão no app"}
                </Button>
              </SectionCard>
            ))}
          </div>
        )}
      </BottomSheet>

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
