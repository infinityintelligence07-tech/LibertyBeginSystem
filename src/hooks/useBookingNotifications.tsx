import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

/**
 * Subscribes to the current user's notifications and surfaces booking-related
 * events as evident sonner toasts (created / approved / cancelled / rescheduled).
 * Mounted once at the app shell level.
 */
export const useBookingNotifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n: any = payload.new;
          const link: string | undefined = n?.link;
          const title: string = n?.title || "Atualização de sessão";
          const message: string = n?.message || "";
          const type: string = n?.type || "";

          const opts = {
            description: message,
            duration: 8000,
            action: link
              ? {
                  label: "Abrir",
                  onClick: () => navigate(link),
                }
              : undefined,
          };

          if (
            type === "booking_cancelled" ||
            type === "booking_rejected"
          ) {
            toast.error(title, opts);
          } else if (
            type === "booking_created" ||
            type === "booking_approved"
          ) {
            toast.success(title, opts);
          } else if (type === "booking_rescheduled" || type === "booking_pending") {
            toast.warning(title, opts);
          } else {
            toast(title, opts);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, navigate]);
};
