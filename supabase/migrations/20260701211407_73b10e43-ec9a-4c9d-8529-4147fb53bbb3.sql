
CREATE TABLE public.nps_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  liberty_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  liberty_name text,
  liberty_whatsapp text,
  session_name text,
  mentor_name text,
  score_overall smallint CHECK (score_overall BETWEEN 0 AND 10),
  score_content smallint CHECK (score_content BETWEEN 0 AND 10),
  score_mentor smallint CHECK (score_mentor BETWEEN 0 AND 10),
  score_action_plan smallint CHECK (score_action_plan BETWEEN 0 AND 10),
  score_tool smallint CHECK (score_tool BETWEEN 0 AND 10),
  key_takeaway text,
  improvements text,
  would_recommend text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.nps_responses TO authenticated;
GRANT ALL ON public.nps_responses TO service_role;

ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

-- Liberty owns their own response (matches by profile.user_id)
CREATE POLICY "Liberty can insert own nps"
  ON public.nps_responses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = liberty_id AND p.user_id = auth.uid())
  );

CREATE POLICY "Liberty can read own nps"
  ON public.nps_responses FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = liberty_id AND p.user_id = auth.uid())
  );

-- Admins can read all
CREATE POLICY "Admins can read all nps"
  ON public.nps_responses FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'super_admin'));

-- Mentors can read nps where they are the mentor
CREATE POLICY "Mentors can read own mentor nps"
  ON public.nps_responses FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = mentor_id AND p.user_id = auth.uid())
  );

CREATE TRIGGER update_nps_responses_updated_at
  BEFORE UPDATE ON public.nps_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
