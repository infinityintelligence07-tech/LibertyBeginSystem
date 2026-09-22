CREATE OR REPLACE FUNCTION public.fire_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_service_key text;
BEGIN
  SELECT value INTO v_url FROM public.system_config WHERE key = 'send_push_url';
  SELECT value INTO v_service_key FROM public.system_config WHERE key = 'send_push_service_key';

  IF v_url IS NULL OR v_service_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title',  NEW.title,
      'body',   COALESCE(NEW.message, ''),
      'link',   COALESCE(NEW.link, '/'),
      'tag',    COALESCE(NEW.type, 'liberty-notif'),
      'notification_id', NEW.id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fire_push_on_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fire_push_on_notification() TO service_role;