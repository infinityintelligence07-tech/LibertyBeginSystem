import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { CalendarDays, MapPin, Clock, ExternalLink, Video, Check, X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState, PageContainer, PageHeader, SectionCard, StatusPill } from "@/components/ds";
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
    toast.success(status === "going" ? "Presença confirmada" : "Resposta registrada");
  };

  return (
    <AppLayout role="liberty">
      <PageContainer>
        <PageHeader title="Eventos" description="Próximos encontros e eventos exclusivos" />

        {loading ? (
          <LoadingState variant="cards" rows={2} />
        ) : events.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nenhum evento agendado"
            description="Assim que um novo encontro for confirmado, ele aparecerá aqui."
          />
        ) : (
          <ul className="space-y-4 list-none m-0 p-0">
            {events.map((event) => {
              const myStatus = rsvps[event.id];
              const deadlinePassed = event.rsvp_deadline
                ? new Date(event.rsvp_deadline).getTime() < Date.now()
                : false;
              const going = counts[event.id] || 0;
              const isFull = event.capacity != null && going >= event.capacity && myStatus !== "going";
              const canRsvp = event.rsvp_enabled !== false && !deadlinePassed && !isFull;
              const saving = savingId === event.id;

              return (
                <li key={event.id}>
                  <SectionCard as="article" padding="none" className="overflow-hidden">
                    {event.cover_image_url && (
                      <div className="aspect-video bg-muted">
                        <img src={event.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      </div>
                    )}
                    <div className="p-4 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="text-[17px] font-semibold text-foreground break-words">{event.title}</h2>
                        {myStatus === "going" && <StatusPill tone="success">Presença confirmada</StatusPill>}
                        {myStatus === "not_going" && <StatusPill tone="neutral">Não vai participar</StatusPill>}
                      </div>

                      <dl className="mt-3 space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <dt className="sr-only">Data</dt>
                          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                          <dd>{format(parseISO(event.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</dd>
                        </div>
                        {event.event_time && (
                          <div className="flex items-center gap-2">
                            <dt className="sr-only">Horário</dt>
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                            <dd>{event.event_time}</dd>
                          </div>
                        )}
                        {(event.location || event.is_online) && (
                          <div className="flex items-start gap-2">
                            <dt className="sr-only">Local</dt>
                            {event.is_online ? (
                              <Video className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                            ) : (
                              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                            )}
                            <dd className="min-w-0">
                              <span className="break-words">{event.location || "Online"}</span>
                              {event.location_url && (
                                <a
                                  href={event.location_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  Abrir <ExternalLink className="h-3 w-3" aria-hidden />
                                </a>
                              )}
                            </dd>
                          </div>
                        )}
                        {going > 0 && (
                          <div className="flex items-center gap-2">
                            <dt className="sr-only">Confirmados</dt>
                            <Users className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                            <dd className="tabular-nums">
                              {going} confirmado{going !== 1 ? "s" : ""}
                              {event.capacity ? ` de ${event.capacity} vagas` : ""}
                            </dd>
                          </div>
                        )}
                      </dl>

                      {event.description && (
                        <p className="text-sm text-muted-foreground mt-4 break-words">{event.description}</p>
                      )}

                      {/* Confirmação de presença */}
                      <div className="mt-5 pt-4 border-t border-border">
                        {canRsvp ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant={myStatus === "going" ? "secondary" : "default"}
                              disabled={saving}
                              aria-pressed={myStatus === "going"}
                              onClick={() => setRsvp(event.id, "going")}
                            >
                              <Check className="h-4 w-4" aria-hidden /> Confirmar presença
                            </Button>
                            <Button
                              variant="outline"
                              disabled={saving}
                              aria-pressed={myStatus === "not_going"}
                              onClick={() => setRsvp(event.id, "not_going")}
                            >
                              <X className="h-4 w-4" aria-hidden /> Não vou participar
                            </Button>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {isFull
                              ? "As vagas para este evento foram preenchidas."
                              : deadlinePassed
                                ? "O prazo de confirmação para este evento encerrou."
                                : "Confirmação de presença não habilitada para este evento."}
                          </p>
                        )}
                      </div>
                    </div>
                  </SectionCard>
                </li>
              );
            })}
          </ul>
        )}
      </PageContainer>
    </AppLayout>
  );
};

export default EventosPage;
