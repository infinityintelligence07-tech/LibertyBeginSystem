import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Escuta mudanças na tabela de agendamentos em tempo real e revalida as queries
 * informadas. Assim, quando o admin OU o mentor aprova/recusa uma sessão, a tela
 * do outro atualiza sozinha (e a pendência desaparece).
 */
export const useBookingsRealtime = (queryKeys: string[], channelSuffix = "shared") => {
  const qc = useQueryClient();
  const keys = queryKeys.join("|");

  useEffect(() => {
    const ch = supabase
      .channel(`bookings-rt-${channelSuffix}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        keys.split("|").forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [keys, channelSuffix, qc]);
};
