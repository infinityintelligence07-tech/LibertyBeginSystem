ALTER TABLE public.booking_reports
  ADD COLUMN IF NOT EXISTS ai_insights TEXT,
  ADD COLUMN IF NOT EXISTS delivered TEXT,
  ADD COLUMN IF NOT EXISTS next_steps TEXT;