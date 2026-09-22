DO $$ BEGIN
  CREATE TYPE public.member_tier AS ENUM ('begin', 'liberty');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS member_tier public.member_tier NOT NULL DEFAULT 'begin';