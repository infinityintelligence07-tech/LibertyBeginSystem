import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { ClipboardList, Search, CheckCircle2, Calendar } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { shortName } from "@/lib/formatName";
import { getEffectiveBookingStatus, isVisibleSessionBooking, sortByScheduledDateDesc } from "@/lib/bookingStatus";

const AdminRelatoriosPage = () => {
  const [search, setSearch] = useState("");

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["admin-bookings-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, sessions(name, order), liberty:profiles!bookings_liberty_id_fkey(full_name), mentor:profiles!bookings_mentor_id_fkey(full_name)")
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return sortByScheduledDateDesc((data || []).filter((b) => isVisibleSessionBooking(b) && getEffectiveBookingStatus(b) === "completed"));
    },
  });

  const filtered = useMemo(() => {
    if (!bookings) return [];
    if (!search) return bookings;
    const q = search.toLowerCase();
    return bookings.filter(
      (b: any) =>
        b.liberty?.full_name?.toLowerCase().includes(q) ||
        b.mentor?.full_name?.toLowerCase().includes(q) ||
        b.sessions?.name?.toLowerCase().includes(q)
    );
  }, [bookings, search]);

  return (
    <AppLayout role="admin">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUpItem} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Relatórios de Sessões</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {bookings?.length ?? 0} sessões realizadas
            </p>
          </div>
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por membro, mentor ou sessão..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-begin w-full pl-10 text-sm"
            />
          </div>
        </motion.div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse h-16" />
            ))}
          </div>
        ) : (
          <motion.div variants={fadeUpItem} className="space-y-2">
            {filtered.map((booking: any) => (
              <div key={booking.id} className="glass-card p-4">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-status-green/10 border border-border flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-status-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{shortName(booking.liberty?.full_name || "Sem dados")}</span>
                      <span className="text-xs text-muted-foreground">com</span>
                      <span className="text-sm text-primary">{shortName(booking.mentor?.full_name || "Sem dados")}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px]">
                        {booking.sessions?.name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(booking.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                  {booking.observations && (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-status-green/10 text-status-green border border-border">
                      Com obs.
                    </span>
                  )}
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <EmptyState
                icon={ClipboardList}
                compact
                title="Nenhuma sessão encontrada"
                description="Ajuste a busca ou o filtro de período."
              />
            )}
          </motion.div>
        )}
      </motion.div>
    </AppLayout>
  );
};

export default AdminRelatoriosPage;
