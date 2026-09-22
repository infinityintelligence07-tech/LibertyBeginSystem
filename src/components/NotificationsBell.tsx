import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Floating notifications bell — app-like, with unread badge and dropdown panel.
 * Surfaces booking events (created, approved, cancelled, rescheduled) in a clear,
 * high-contrast way for all roles.
 */
export const NotificationsBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: notifications = [], refetch } = useQuery({
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

  const unread = notifications.filter((n: any) => !n.read_at);
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

  const handleOpen = (n: any) => {
    if (!n.read_at) markOneRead(n.id);
    setOpen(false);
    if (!n.link) return;
    if (/^https?:\/\//i.test(n.link)) {
      window.open(n.link, "_blank", "noopener,noreferrer");
    } else {
      navigate(n.link);
    }
  };


  const toneFor = (type: string | null) => {
    switch (type) {
      case "booking_cancelled":
      case "booking_rejected":
        return { dot: "bg-status-red", ring: "ring-status-red/30" };
      case "booking_created":
      case "booking_approved":
        return { dot: "bg-status-green", ring: "ring-status-green/30" };
      case "booking_rescheduled":
      case "booking_pending":
      case "booking_not_realized":
        return { dot: "bg-status-yellow", ring: "ring-status-yellow/30" };
      default:
        return { dot: "bg-primary", ring: "ring-primary/30" };
    }
  };

  if (!user) return null;

  return (
    <div
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
      className="fixed right-[4.5rem] lg:right-[6rem] z-40"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label="Notificações"
            title="Notificações"
            className="relative h-10 w-10 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-foreground hover:bg-muted hover:border-primary/40 transition-all"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-status-red text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-background tabular-nums">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={10}
          className="w-[min(92vw,360px)] p-0 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Notificações</h3>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-status-red text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <CheckCheck className="h-3 w-3" /> Marcar lidas
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 px-4 text-center text-sm text-muted-foreground">
                Sem notificações por enquanto.
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {notifications.map((n: any) => {
                  const tone = toneFor(n.type);
                  const isUnread = !n.read_at;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => handleOpen(n)}
                        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                          isUnread ? "bg-primary/[0.04] hover:bg-primary/[0.08]" : "hover:bg-muted/50"
                        }`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full mt-1.5 shrink-0 ${tone.dot} ${
                            isUnread ? `ring-2 ${tone.ring}` : "opacity-40"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm truncate ${
                              isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                            }`}
                          >
                            {n.title}
                          </p>
                          {n.message && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
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
    </div>
  );
};
