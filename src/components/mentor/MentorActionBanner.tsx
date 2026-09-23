import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { demoMentorActionNotifications } from "@/lib/demoForUser";
import { useDemoData } from "@/contexts/DemoDataContext";
import { invalidateMentorBookingQueries, translateBookingError } from "@/components/mentor/MentorBookingActions";
import { Button } from "@/components/ui/button";
import { BottomSheet, SectionCard, StatusPill, TextAreaField } from "@/components/ds";
import { cn } from "@/lib/utils";

type ActionNotif = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  created_at: string;
  related_booking_id: string | null;
};

const ACTION_TYPES = [
  "booking_pending",
  "booking_created",
  "booking_rescheduled",
  "booking_cancelled",
  "booking_not_realized",
  "booking_reminder",
  "report_pending",
];

/** Ações pendentes do mentor — versão minimalista, tipo lista de e-mails. */
export const MentorActionBanner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { demoEnabled: demoMode } = useDemoData();
  const [dismissedDemo, setDismissedDemo] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const { data: fetched = [] } = useQuery({
    queryKey: ["mentor-action-banner", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchInterval: 300_000,

    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,type,title,message,link,created_at,related_booking_id")
        .eq("user_id", user!.id)
        .is("read_at", null)
        .in("type", ACTION_TYPES)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as ActionNotif[];
    },
  });

  const items: ActionNotif[] = demoMode
    ? [
        ...(demoMentorActionNotifications() as unknown as ActionNotif[]).filter(
          (n) => !dismissedDemo.has(n.id),
        ),
        ...fetched,
      ]
    : fetched;

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`mentor-banner-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["mentor-action-banner", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  const markRead = async (id: string) => {
    if (id.startsWith("demo-")) {
      setDismissedDemo((s) => new Set(s).add(id));
      return;
    }
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["mentor-action-banner", user?.id] });
  };

  // Recusa: em vez de window.prompt, abre um BottomSheet com campo de motivo.
  const [rejectTarget, setRejectTarget] = useState<ActionNotif | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Mesmos efeitos da Agenda (MentorSessoes): aprovar zera approval_required; recusar pede motivo e libera o horário.
  const runBooking = async (n: ActionNotif, action: "approve" | "reject", typedReason?: string) => {
    const isDemo = n.id.startsWith("demo-");
    if (!isDemo && !n.related_booking_id) {
      toast.error("Esta notificação não está mais ligada a uma sessão. Abra a Agenda para revisar.");
      await markRead(n.id);
      return;
    }
    let reason = "Recusada pelo mentor";
    if (action === "reject" && !isDemo) {
      if (typedReason === undefined) {
        setRejectReason("");
        setRejectTarget(n);
        return;
      }
      reason = typedReason.trim() || "Horário indisponível";
    }
    setBusy((s) => new Set(s).add(n.id));
    try {
      if (!isDemo && n.related_booking_id) {
        const patch =
          action === "approve"
            ? { status: "scheduled" as const, approval_required: false }
            : { status: "cancelled" as const, cancellation_reason: reason };
        const { data, error } = await supabase
          .from("bookings")
          .update(patch)
          .eq("id", n.related_booking_id)
          .select("id, availability_id");
        if (error) {
          toast.error(translateBookingError(error, "Não consegui atualizar a sessão."));
          return;
        }
        if (!data || data.length === 0) {
          toast.error("Você não tem permissão para alterar esta sessão.");
          return;
        }
        if (action === "approve") {
          // Sincroniza com Google Calendar (mentor + aluno) assim que aprovada
          supabase.functions
            .invoke("google-calendar-sync", { body: { booking_id: n.related_booking_id } })
            .catch((e) => console.error("Falha ao sincronizar com o Google Agenda", e));
        } else if (data[0].availability_id) {
          const { error: availError } = await supabase
            .from("mentor_availability")
            .update({ is_booked: false })
            .eq("id", data[0].availability_id);
          if (availError) console.error("Falha ao liberar horário na disponibilidade", availError);
        }
        await invalidateMentorBookingQueries(qc);
      }
      toast.success(action === "approve" ? "Sessão confirmada." : "Sessão recusada.");
      await markRead(n.id);
    } finally {
      setBusy((s) => {
        const n2 = new Set(s);
        n2.delete(n.id);
        return n2;
      });
    }
  };

  const openLink = async (n: ActionNotif) => {
    await markRead(n.id);
    if (n.link) navigate(n.link);
  };

  const dotFor = (t: string) => {
    if (t === "booking_pending") return "bg-status-yellow";
    if (t === "report_pending" || t === "booking_not_realized") return "bg-destructive";
    if (t === "booking_reminder" || t === "booking_rescheduled") return "bg-status-blue";
    if (t === "booking_cancelled") return "bg-destructive";
    if (t === "booking_created") return "bg-status-green";
    return "bg-muted-foreground";
  };

  const [open, setOpen] = useState(false);

  const clearAll = async () => {
    items.forEach((i) => i.id.startsWith("demo-") && setDismissedDemo((s) => new Set(s).add(i.id)));
    const real = items.filter((i) => !i.id.startsWith("demo-")).map((i) => i.id);
    if (real.length) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", real);
      qc.invalidateQueries({ queryKey: ["mentor-action-banner", user?.id] });
    }
  };

  return (
    <>
      {items.length > 0 && (
          <div>
            <SectionCard as="section" padding="none" aria-label="Ações pendentes">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full min-h-[48px] flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-accent/60 transition-colors duration-ds-1 ease-ds focus-visible:outline-none focus-visible:bg-accent/60"
                aria-expanded={open}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  Avisos e solicitações
                  <StatusPill tone="warning" withDot={false}>{items.length}</StatusPill>
                </span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-ds-2 ease-ds", open && "rotate-180")} aria-hidden />
              </button>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="border-t border-border overflow-hidden"
                  >
                    <div className="flex items-center justify-end px-2 py-1 border-b border-border">
                      <Button variant="ghost" size="sm" onClick={clearAll}>
                        Limpar todas
                      </Button>
                    </div>
                    <ul className="divide-y divide-border">
                      {items.map((n) => {
                        const isPending = n.type === "booking_pending";
                        const isReport = n.type === "report_pending";
                        const disabled = busy.has(n.id);
                        return (
                          <li key={n.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 px-4 py-3 min-h-[56px]">
                            <span className={cn("h-2 w-2 rounded-full shrink-0", dotFor(n.type))} aria-hidden />
                            <div className="min-w-0 flex-1 basis-[60%]">
                              <p className="text-sm text-foreground leading-snug truncate">{n.title}</p>
                              {n.message && <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.message}</p>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-auto">
                              {isPending ? (
                                <>
                                  <Button size="sm" disabled={disabled} onClick={() => runBooking(n, "approve")}>
                                    Confirmar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={disabled}
                                    onClick={() => runBooking(n, "reject")}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    Recusar
                                  </Button>
                                </>
                              ) : isReport ? (
                                <Button size="sm" variant="secondary" onClick={() => openLink(n)}>
                                  Preencher
                                </Button>
                              ) : n.link ? (
                                <Button size="sm" variant="ghost" onClick={() => openLink(n)}>
                                  Ver
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                                  Ok
                                </Button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </SectionCard>
          </div>
        )}

      <BottomSheet
        open={!!rejectTarget}
        onOpenChange={(next) => { if (!next) setRejectTarget(null); }}
        title="Recusar solicitação"
        description="O membro verá esta mensagem e poderá escolher outro horário."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!!rejectTarget && busy.has(rejectTarget.id)}
              onClick={async () => {
                if (!rejectTarget) return;
                const target = rejectTarget;
                setRejectTarget(null);
                await runBooking(target, "reject", rejectReason);
              }}
            >
              Recusar sessão
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Motivo da recusa"
          hint="Se deixar em branco, o membro verá “Horário indisponível”."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Ex.: tenho um compromisso nesse horário."
          className="min-h-[96px] resize-y"
        />
      </BottomSheet>
    </>
  );
};
