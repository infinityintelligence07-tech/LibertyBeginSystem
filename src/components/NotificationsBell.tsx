import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconButton } from "@/components/ds";
import type { Tables } from "@/integrations/supabase/types";

type NotificationRow = Tables<"notifications">;

/**
 * Sino de notificações do header: badge de não lidas + painel em Popover.
 * Mostra eventos de agendamento (criado, aprovado, cancelado, remarcado) para todos os papéis.
 */
export const NotificationsBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: notifications = [], refetch } = useQuery<NotificationRow[]>({
    queryKey: ["notifications-bell", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
    // Realtime (abaixo) já entrega novas notificações na hora.
    // O polling é só rede de segurança — intervalo longo para reduzir carga no banco.
    refetchInterval: 300_000,

  });

  // Realtime: refresh when a new notification arrives
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`bell-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, refetch]);

  const unread = notifications.filter((n) => !n.read_at);
  const unreadCount = unread.length;

  const markAllRead = async () => {
    if (!user?.id || unreadCount === 0) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    refetch();
  };

  const markOneRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    refetch();
  };

  const handleOpen = (n: NotificationRow) => {
    if (!n.read_at) markOneRead(n.id);
    setOpen(false);
    if (!n.link) return;
    if (/^https?:\/\//i.test(n.link)) {
      window.open(n.link, "_blank", "noopener,noreferrer");
    } else {
      navigate(n.link);
    }
  };


  const dotFor = (type: string | null) => {
    switch (type) {
      case "booking_cancelled":
      case "booking_rejected":
        return "bg-status-red";
      case "booking_created":
      case "booking_approved":
        return "bg-status-green";
      case "booking_rescheduled":
      case "booking_pending":
      case "booking_not_realized":
        return "bg-status-yellow";
      default:
        return "bg-primary";
    }
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton
          aria-label={unreadCount > 0 ? `Notificações, ${unreadCount} não lidas` : "Notificações"}
          className="hit-44"
        >
          <Bell className="h-5 w-5" aria-hidden />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold flex items-center justify-center ring-2 ring-background tabular-nums"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(92vw,360px)] p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 min-h-12 border-b border-border">
          <h3 className="text-[15px] font-semibold text-foreground">
            Notificações
            {unreadCount > 0 && (
              <span className="ml-2 text-xs font-medium text-muted-foreground tabular-nums">{unreadCount} não lidas</span>
            )}
          </h3>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="min-h-11 -mr-2 px-2 text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors duration-ds-1 rounded-ds focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Marcar lidas
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-10 px-4 text-center text-sm text-muted-foreground">Sem notificações por enquanto.</div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const isUnread = !n.read_at;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleOpen(n)}
                      className={`w-full min-h-14 text-left px-4 py-3 flex items-start gap-3 transition-colors duration-ds-1 focus-visible:outline-none focus-visible:bg-accent ${
                        isUnread ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-accent/60"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`h-2 w-2 rounded-full mt-2 shrink-0 ${dotFor(n.type)} ${isUnread ? "" : "opacity-30"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm truncate ${isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}`}>
                          {n.title}
                        </p>
                        {n.message && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>}
                        <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                          {format(parseISO(n.created_at), "dd MMM · HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
