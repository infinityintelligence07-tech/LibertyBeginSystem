ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
-- Backfill: existing members are considered completed (they already use the platform)
UPDATE public.profiles SET onboarding_completed = true WHERE created_at < now();