CREATE OR REPLACE FUNCTION public.clear_pending_notifications_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status::text = 'pending_approval' AND NEW.status::text IS DISTINCT FROM 'pending_approval' THEN
    UPDATE public.notifications
      SET read_at = now()
    WHERE related_booking_id = NEW.id
      AND type = 'booking_pending'
      AND read_at IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_clear_pending_notifications ON public.bookings;
CREATE TRIGGER trg_clear_pending_notifications
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.clear_pending_notifications_on_status_change();