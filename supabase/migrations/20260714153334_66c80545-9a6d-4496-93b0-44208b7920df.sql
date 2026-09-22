-- 1) push_subscriptions: FCM tokens per device
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own push tokens" ON public.push_subscriptions;
CREATE POLICY "Users manage own push tokens"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2) pg_net extension (Supabase-provided) for async HTTP from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 3) Trigger: on new notifications row -> POST to send-push edge function
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
  -- Read config saved by admins via app_settings (avoids hardcoded refs)
  SELECT value INTO v_url FROM public.system_config WHERE key = 'send_push_url';
  SELECT value INTO v_service_key FROM public.system_config WHERE key = 'send_push_service_key';

  IF v_url IS NULL OR v_service_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
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
  -- Never break the app if push delivery fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fire_push_on_notification ON public.notifications;
CREATE TRIGGER trg_fire_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.fire_push_on_notification();