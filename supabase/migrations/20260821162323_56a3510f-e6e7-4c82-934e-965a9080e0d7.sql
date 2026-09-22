CREATE OR REPLACE FUNCTION public.enforce_member_booking_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month_count integer;
  v_month_key text;
  v_consumes_slot boolean;
  v_requires_month_check boolean;
BEGIN
  IF NEW.liberty_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_consumes_slot := NEW.status::text NOT IN ('cancelled', 'not_realized');
  v_requires_month_check := v_consumes_slot AND (
    TG_OP = 'INSERT'
    OR OLD.status::text IN ('cancelled', 'not_realized')
    OR OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date
    OR OLD.liberty_id IS DISTINCT FROM NEW.liberty_id
  );

  IF v_requires_month_check THEN
    v_month_key := NEW.liberty_id::text || ':' || to_char(NEW.scheduled_date, 'YYYY-MM');
    PERFORM pg_advisory_xact_lock(hashtextextended(v_month_key, 0));

    SELECT count(*)
      INTO v_month_count
    FROM public.bookings b
    WHERE b.liberty_id = NEW.liberty_id
      AND b.scheduled_date >= date_trunc('month', NEW.scheduled_date::timestamp)::date
      AND b.scheduled_date < (date_trunc('month', NEW.scheduled_date::timestamp) + interval '1 month')::date
      AND b.status::text NOT IN ('cancelled', 'not_realized')
      AND b.id IS DISTINCT FROM NEW.id;

    IF v_month_count >= 2 THEN
      RAISE EXCEPTION 'MONTHLY_BOOKING_LIMIT_EXCEEDED'
        USING ERRCODE = 'P0001',
              DETAIL = 'O membro já possui duas sessões contabilizadas neste mês.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;