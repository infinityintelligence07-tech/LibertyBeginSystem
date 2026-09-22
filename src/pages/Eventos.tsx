import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { CalendarDays, MapPin, Clock, ExternalLink, Video, Check, X, Users } from "lucide-react";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  location: string | null;
  location_url: string | null;
  cover_image_url: string | null;
  is_online: boolean | null;
  rsvp_enabled: boolean | null;
  rsvp_deadline: string | null;
  capacity: number | null;
}

type RsvpStatus = "going" | "not_going";

const EventosPage = () => {
  const { profile } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [rsvps, setRsvps] = useState<Record<string, RsvpStatus>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("events")
        .select(
          "id, title, description, event_date, event_time, location, location_url, cover_image_url, is_online, rsvp_enabled, rsvp_deadline, capacity",
        )
        .eq("is_visible", true)
        .order("event_date", { ascending: true });
      const list = (data as EventRow[]) || [];
      setEvents(list);

      if (profile?.id && list.length) {
        const { data: mine } = await supabase
          .from("event_attendance")
          .select("event_id, status")
          .eq("profile_id", profile.id);
        const map: Record<string, RsvpStatus> = {};
        (mine || []).forEach((r: any) => { map[r.event_id] = r.status; });
        setRsvps(map);

        const { data: all } = await supabase
          .from("event_attendance")
          .select("event_id, status")
          .eq("status", "going");
        const c: Record<string, number> = {};
        (all || []).forEach((r: any) => { c[r.event_id] = (c[r.event_id] || 0) + 1; });
        setCounts(c);
      }
      setLoading(false);
    };
    load();
  }, [profile?.id]);

  const setRsvp = async (eventId: string, status: RsvpStatus) => {
    if (!profile?.id) return;
    setSavingId(eventId);
    const { error } = await supabase
      .from("event_attendance")
      .upsert({ event_id: eventId, profile_id: profile.id, status }, { onConflict: "event_id,profile_id" });
    setSavingId(null);
    if (error) { toast.error("Não foi possível salvar sua resposta."); return; }
    const previous = rsvps[eventId];
    setRsvps((p) => ({ ...p, [eventId]: status }));
    setCounts((p) => {
      const current = p[eventId] || 0;
      if (status === "going" && previous !== "going") return { ...p, [eventId]: current + 1 };
      if (status === "not_going" && previous === "going") return { ...p, [eventId]: Math.max(0, current - 1) };
      return p;
    });
    toast.success(status === "going" ? "Presença confirmada!" : "Tudo bem, ficamos para a próxima.");
  };

  return (
    <AppLayout role="liberty">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8">
        <motion.div variants={fadeUpItem}>
          <h1 className="text-2xl font-semibold text-foreground">Eventos</h1>
          <p className="text-muted-foreground text-sm">Próximos encontros e eventos exclusivos</p>
        </motion.div>

        {loading ? (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="glass-card p-6 h-32 animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <motion.div variants={fadeUpItem}>
            <EmptyState
              icon={CalendarDays}
              title="Nenhum evento agendado"
              description="Assim que um novo encontro for confirmado, ele aparecerá aqui."
            />
          </motion.div>
        ) : (
          <motion.div variants={staggerContainer} className="space-y-6">
            {events.map((event) => {
              const myStatus = rsvps[event.id];
              const deadlinePassed = event.rsvp_deadline
                ? new Date(event.rsvp_deadline).getTime() < Date.now()
                : false;
              const going = counts[event.id] || 0;
              const isFull = event.capacity != null && going >= event.capacity && myStatus !== "going";
              const canRsvp = event.rsvp_enabled !== false && !deadlinePassed && !isFull;

              return (
                <motion.div key={event.id} variants={fadeUpItem} className="glass-card p-6 overflow-hidden">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-medium text-foreground mb-3 break-words">{event.title}</h3>

                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                        <span>{format(parseISO(event.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                      </div>
                      {event.event_time && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary shrink-0" />
                          <span>{event.event_time}</span>
                        </div>
                      )}
                      {(event.location || event.is_online) && (
                        <div className="flex items-start gap-2">
                          {event.is_online ? (
                            <Video className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          ) : (
                            <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <span className="break-words">{event.location || "Online"}</span>
                            {event.location_url && (
                              <a
                                href={event.location_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 inline-flex items-center gap-1 text-primary hover:text-silver-light transition-colors"
                              >
                                Abrir <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                      {going > 0 && (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary shrink-0" />
                          <span>
                            {going} confirmado{going !== 1 ? "s" : ""}
                            {event.capacity ? ` de ${event.capacity} vagas` : ""}
                          </span>
                        </div>
                      )}
                    </div>

                    {event.description && (
                      <p className="text-sm text-muted-foreground mt-4 break-words">{event.description}</p>
                    )}

                    {/* Confirmação de presença */}
                    <div className="mt-5 pt-4 border-t border-border/40">
                      {myStatus && (
                        <p className="text-xs mb-2.5">
                          {myStatus === "going" ? (
                            <span className="text-status-green font-medium">Presença confirmada ✦</span>
                          ) : (
                            <span className="text-muted-foreground">Você marcou que não vai participar.</span>
                          )}
                        </p>
                      )}
                      {canRsvp ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            disabled={savingId === event.id}
                            onClick={() => setRsvp(event.id, "going")}
                            className={`text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                              myStatus === "going"
                                ? "bg-status-green/15 text-status-green border border-status-green/30"
                                : "btn-silver"
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" /> Confirmar presença
                          </button>
                          <button
                            disabled={savingId === event.id}
                            onClick={() => setRsvp(event.id, "not_going")}
                            className={`text-xs px-4 py-2 rounded-lg border flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                              myStatus === "not_going"
                                ? "border-status-red/40 text-status-red bg-status-red/10"
                                : "border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <X className="h-3.5 w-3.5" /> Não vou participar
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {isFull
                            ? "As vagas para este evento foram preenchidas."
                            : deadlinePassed
                              ? "O prazo de confirmação para este evento encerrou."
                              : "Confirmação de presença não habilitada para este evento."}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </motion.div>
    </AppLayout>
  );
};

export default EventosPage;
