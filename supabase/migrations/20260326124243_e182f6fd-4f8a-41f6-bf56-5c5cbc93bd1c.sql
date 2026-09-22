
-- Create session_tasks table
CREATE TABLE public.session_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  description text NOT NULL,
  is_completed boolean DEFAULT false,
  result_type text CHECK (result_type IN ('quantitative', 'qualitative')),
  result_value text,
  result_metric text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.session_tasks ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage session_tasks"
ON public.session_tasks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Mentors can manage tasks for their own bookings
CREATE POLICY "Mentors can manage own session_tasks"
ON public.session_tasks FOR ALL TO authenticated
USING (
  booking_id IN (
    SELECT b.id FROM bookings b
    JOIN profiles p ON p.id = b.mentor_id
    WHERE p.user_id = auth.uid()
  )
);

-- Libertys can view and update tasks for their own bookings
CREATE POLICY "Libertys can view own session_tasks"
ON public.session_tasks FOR SELECT TO authenticated
USING (
  booking_id IN (
    SELECT b.id FROM bookings b
    JOIN profiles p ON p.id = b.liberty_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Libertys can update own session_tasks"
ON public.session_tasks FOR UPDATE TO authenticated
USING (
  booking_id IN (
    SELECT b.id FROM bookings b
    JOIN profiles p ON p.id = b.liberty_id
    WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  booking_id IN (
    SELECT b.id FROM bookings b
    JOIN profiles p ON p.id = b.liberty_id
    WHERE p.user_id = auth.uid()
  )
);
