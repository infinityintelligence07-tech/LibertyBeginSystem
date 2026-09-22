import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { bookingRuleErrorMessage } from "@/lib/bookingRules";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { isDemoOn, demoMentorActionNotifications } from "@/lib/demoForUser";

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
  const demoMode = isDemoOn();
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

  const runBooking = async (n: ActionNotif, action: "approve" | "reject") => {
    setBusy((s) => new Set(s).add(n.id));
    try {
      if (!n.id.startsWith("demo-") && n.related_booking_id) {
        const patch =
          action === "approve"
            ? { status: "scheduled" as const }
            : { status: "cancelled" as const, cancellation_reason: "Recusada pelo mentor" };
        const { error } = await supabase.from("bookings").update(patch).eq("id", n.related_booking_id);
        if (error) {
          toast.error(bookingRuleErrorMessage(error) || "Não consegui atualizar a sessão.");
          return;
        }
        // Sincroniza com Google Calendar (mentor + aluno) assim que aprovada
        if (action === "approve") {
          supabase.functions
            .invoke("google-calendar-sync", { body: { booking_id: n.related_booking_id } })
            .catch(() => {});
        }
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
    if (t === "report_pending" || t === "booking_not_realized") return "bg-destructive/70";
    if (t === "booking_reminder") return "bg-status-blue";
    if (t === "booking_cancelled") return "bg-destructive/50";
    if (t === "booking_rescheduled") return "bg-status-blue/70";
    if (t === "booking_created" || t === "booking_approved") return "bg-status-green/70";
    return "bg-muted-foreground/60";
  };

  const [open, setOpen] = useState(false);

  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="rounded-lg border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden"
          aria-label="Ações pendentes"
        >
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/20 transition-colors"
            aria-expanded={open}
          >
            <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-status-yellow" />
              Pendências
              <span className="text-foreground tabular-nums">{items.length}</span>
            </span>
            <span className={`text-muted-foreground text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
          </button>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="border-t border-border/50"
              >
                <div className="flex items-center justify-end px-3 py-1.5 border-b border-border/40">
                  <button
                    onClick={async () => {
                      items.forEach((i) => i.id.startsWith("demo-") && setDismissedDemo((s) => new Set(s).add(i.id)));
                      const real = items.filter((i) => !i.id.startsWith("demo-")).map((i) => i.id);
                      if (real.length) {
                        await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", real);
                        qc.invalidateQueries({ queryKey: ["mentor-action-banner", user?.id] });
                      }
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    limpar todas
                  </button>
                </div>
                <ul className="divide-y divide-border/50">
                  {items.map((n) => {
                    const isPending = n.type === "booking_pending";
                    const isReport = n.type === "report_pending";
                    const disabled = busy.has(n.id);
                    return (
                      <li
                        key={n.id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors"
                      >
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotFor(n.type)}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground leading-tight truncate">{n.title}</p>
                          {n.message && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.message}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isPending ? (
                            <>
                              <button
                                disabled={disabled}
                                onClick={() => runBooking(n, "approve")}
                                className="text-xs font-medium text-foreground hover:text-primary px-2 py-1 disabled:opacity-40 transition-colors"
                              >
                                Confirmar
                              </button>
                              <span className="text-border">·</span>
                              <button
                                disabled={disabled}
                                onClick={() => runBooking(n, "reject")}
                                className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 disabled:opacity-40 transition-colors"
                              >
                                Recusar
                              </button>
                            </>
                          ) : isReport ? (
                            <button
                              onClick={() => openLink(n)}
                              className="text-xs font-medium text-foreground hover:text-primary px-2 py-1 transition-colors"
                            >
                              Preencher
                            </button>
                          ) : n.link ? (
                            <button
                              onClick={() => openLink(n)}
                              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 transition-colors"
                            >
                              Ver
                            </button>
                          ) : (
                            <button
                              onClick={() => markRead(n.id)}
                              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 transition-colors"
                            >
                              Ok
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      )}
    </AnimatePresence>
  );
};
