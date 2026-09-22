
-- Frente 7: session closure requirements
ALTER TABLE public.booking_reports
  ADD COLUMN IF NOT EXISTS pdf_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_delivery_method text,
  ADD COLUMN IF NOT EXISTS tool_attachment_url text;

-- Featured case of the day
CREATE TABLE IF NOT EXISTS public.featured_case_of_day (
  id uuid primary key default gen_random_uuid(),
  case_date date not null unique,
  member_id uuid references public.profiles(id) on delete set null,
  headline text not null,
  summary text not null,
  metric_label text,
  metric_value text,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.featured_case_of_day TO authenticated;
GRANT ALL ON public.featured_case_of_day TO service_role;
ALTER TABLE public.featured_case_of_day ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone auth can view featured case" ON public.featured_case_of_day;
CREATE POLICY "Anyone auth can view featured case"
  ON public.featured_case_of_day FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage featured case" ON public.featured_case_of_day;
CREATE POLICY "Admins manage featured case"
  ON public.featured_case_of_day FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
