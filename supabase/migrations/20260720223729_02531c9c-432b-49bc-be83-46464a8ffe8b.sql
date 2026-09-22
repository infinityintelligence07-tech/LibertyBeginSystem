
ALTER TABLE public.featured_case_of_day
  ADD COLUMN IF NOT EXISTS metric_label text,
  ADD COLUMN IF NOT EXISTS metric_value text;
