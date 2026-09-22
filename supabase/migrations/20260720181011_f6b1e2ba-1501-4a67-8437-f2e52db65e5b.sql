
-- 1. member_points
CREATE TABLE public.member_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL,
  points INT NOT NULL,
  reason TEXT NOT NULL,
  related_booking_id UUID,
  related_task_id UUID,
  related_testimonial_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_points TO authenticated;
GRANT ALL ON public.member_points TO service_role;
ALTER TABLE public.member_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read member_points" ON public.member_points
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "service manages member_points" ON public.member_points
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_member_points_member ON public.member_points(member_id);
CREATE INDEX idx_member_points_created ON public.member_points(created_at DESC);

-- 2. member_testimonials
CREATE TABLE public.member_testimonials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL,
  headline TEXT NOT NULL,
  content TEXT NOT NULL,
  result_metric TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_testimonials TO authenticated;
GRANT ALL ON public.member_testimonials TO service_role;
ALTER TABLE public.member_testimonials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read public testimonials" ON public.member_testimonials
  FOR SELECT TO authenticated USING (
    is_public = true
    OR member_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "member manages own testimonials" ON public.member_testimonials
  FOR ALL TO authenticated USING (
    member_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  ) WITH CHECK (
    member_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE TRIGGER trg_testimonials_updated_at
  BEFORE UPDATE ON public.member_testimonials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. featured_case_of_day
CREATE TABLE public.featured_case_of_day (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_date DATE NOT NULL UNIQUE,
  member_id UUID NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_booking_id UUID,
  source_testimonial_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.featured_case_of_day TO authenticated;
GRANT ALL ON public.featured_case_of_day TO service_role;
ALTER TABLE public.featured_case_of_day ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read featured case" ON public.featured_case_of_day
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "service manages featured case" ON public.featured_case_of_day
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. profiles columns for ranking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_ranking_featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_position INT;

-- 5. Auto-points triggers
CREATE OR REPLACE FUNCTION public.award_points_on_session_completed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status::text = 'completed' AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'completed') THEN
    IF NEW.liberty_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.member_points
      WHERE related_booking_id = NEW.id AND reason = 'session_completed'
    ) THEN
      INSERT INTO public.member_points(member_id, points, reason, related_booking_id)
      VALUES (NEW.liberty_id, 10, 'session_completed', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_award_points_session ON public.bookings;
CREATE TRIGGER trg_award_points_session
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.award_points_on_session_completed();

CREATE OR REPLACE FUNCTION public.award_points_on_task_completed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_liberty_id UUID;
BEGIN
  IF NEW.is_completed = true AND (TG_OP = 'INSERT' OR COALESCE(OLD.is_completed, false) = false) THEN
    IF NEW.booking_id IS NOT NULL THEN
      SELECT liberty_id INTO v_liberty_id FROM public.bookings WHERE id = NEW.booking_id;
      IF v_liberty_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.member_points
        WHERE related_task_id = NEW.id AND reason = 'task_completed'
      ) THEN
        INSERT INTO public.member_points(member_id, points, reason, related_task_id)
        VALUES (v_liberty_id, 3, 'task_completed', NEW.id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_award_points_task ON public.session_tasks;
CREATE TRIGGER trg_award_points_task
  AFTER INSERT OR UPDATE OF is_completed ON public.session_tasks
  FOR EACH ROW EXECUTE FUNCTION public.award_points_on_task_completed();

CREATE OR REPLACE FUNCTION public.award_points_on_testimonial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.member_points(member_id, points, reason, related_testimonial_id)
    VALUES (NEW.member_id, 20, 'testimonial_added', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_award_points_testimonial ON public.member_testimonials;
CREATE TRIGGER trg_award_points_testimonial
  AFTER INSERT ON public.member_testimonials
  FOR EACH ROW EXECUTE FUNCTION public.award_points_on_testimonial();

-- 6. Backfill points for already-completed sessions and tasks
INSERT INTO public.member_points(member_id, points, reason, related_booking_id, created_at)
SELECT b.liberty_id, 10, 'session_completed', b.id, COALESCE(b.updated_at, b.created_at, now())
FROM public.bookings b
WHERE b.status::text = 'completed'
  AND b.liberty_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.member_points mp
    WHERE mp.related_booking_id = b.id AND mp.reason = 'session_completed'
  );

INSERT INTO public.member_points(member_id, points, reason, related_task_id, created_at)
SELECT b.liberty_id, 3, 'task_completed', t.id, COALESCE(t.completed_at, t.updated_at, now())
FROM public.session_tasks t
JOIN public.bookings b ON b.id = t.booking_id
WHERE t.is_completed = true
  AND b.liberty_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.member_points mp
    WHERE mp.related_task_id = t.id AND mp.reason = 'task_completed'
  );
