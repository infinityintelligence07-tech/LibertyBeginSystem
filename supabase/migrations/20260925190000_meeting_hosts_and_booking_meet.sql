-- Pool de hosts Meet + metadados de sala por booking
CREATE TABLE IF NOT EXISTS public.meeting_hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  email text NOT NULL UNIQUE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_hosts_active_idx
  ON public.meeting_hosts (is_active, sort_order);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS meeting_provider text,
  ADD COLUMN IF NOT EXISTS meeting_host_id uuid REFERENCES public.meeting_hosts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meeting_space_name text,
  ADD COLUMN IF NOT EXISTS meeting_calendar_event_id text,
  ADD COLUMN IF NOT EXISTS meeting_wa_member_text text,
  ADD COLUMN IF NOT EXISTS meeting_wa_mentor_text text,
  ADD COLUMN IF NOT EXISTS meeting_provisioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_provision_error text;

COMMENT ON COLUMN public.bookings.meeting_provider IS 'meet | zoom | null';
COMMENT ON COLUMN public.bookings.zoom_join_url IS 'URL de entrada (Meet ou Zoom); UI legada usa este campo';

INSERT INTO public.system_config (key, value, updated_at)
VALUES ('meeting_host_email', 'membrosliberty@gmail.com', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO public.system_config (key, value, updated_at)
VALUES ('meeting_buffer_minutes', '45', now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.meeting_hosts (label, email, is_active, sort_order)
VALUES ('Liberty Meet (Google One)', 'membrosliberty@gmail.com', true, 0)
ON CONFLICT (email) DO UPDATE
  SET label = EXCLUDED.label,
      is_active = true,
      updated_at = now();

UPDATE public.meeting_hosts mh
SET profile_id = p.id, updated_at = now()
FROM public.profiles p
WHERE lower(p.email) = lower(mh.email)
  AND mh.profile_id IS NULL;

ALTER TABLE public.meeting_hosts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read meeting_hosts" ON public.meeting_hosts;
CREATE POLICY "Staff read meeting_hosts"
  ON public.meeting_hosts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'super_admin', 'mentor')
    )
  );

DROP POLICY IF EXISTS "Admins manage meeting_hosts" ON public.meeting_hosts;
CREATE POLICY "Admins manage meeting_hosts"
  ON public.meeting_hosts FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'super_admin')
    )
  );
