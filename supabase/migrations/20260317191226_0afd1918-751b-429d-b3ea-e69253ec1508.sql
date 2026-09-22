
-- Add pillar column to sessions
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS pillar text DEFAULT NULL;

-- Add session_rate to profiles (per-mentor custom rate)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS session_rate numeric DEFAULT NULL;

-- Create content_type for contents
CREATE TABLE public.contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  content_type text NOT NULL DEFAULT 'video',
  url text,
  pillar text,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  phase_unlock integer DEFAULT 1,
  is_public boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contents" ON public.contents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view active contents" ON public.contents FOR SELECT TO authenticated
  USING (is_active = true);

-- Create events table
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  event_time text,
  location text,
  location_url text,
  cover_image_url text,
  is_online boolean DEFAULT false,
  is_visible boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage events" ON public.events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view visible events" ON public.events FOR SELECT TO authenticated
  USING (is_visible = true);

-- Create booking_reports table (mentor fills after session)
CREATE TABLE public.booking_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  summary text,
  action_plan text,
  goals text,
  mentor_impressions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(booking_id)
);

ALTER TABLE public.booking_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reports" ON public.booking_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Mentors can manage own reports" ON public.booking_reports FOR ALL TO authenticated
  USING (
    booking_id IN (
      SELECT b.id FROM public.bookings b
      JOIN public.profiles p ON p.id = b.mentor_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Libertys can view own reports" ON public.booking_reports FOR SELECT TO authenticated
  USING (
    booking_id IN (
      SELECT b.id FROM public.bookings b
      JOIN public.profiles p ON p.id = b.liberty_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_contents_updated_at BEFORE UPDATE ON public.contents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_booking_reports_updated_at BEFORE UPDATE ON public.booking_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
