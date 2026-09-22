
-- Add validation fields to session_tasks for the student→mentor validation flow
ALTER TABLE public.session_tasks
  ADD COLUMN IF NOT EXISTS completed_by_role text CHECK (completed_by_role IN ('liberty', 'mentor')),
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'mentor' CHECK (origin IN ('mentor', 'ai')),
  ADD COLUMN IF NOT EXISTS created_by_mentor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Backfill: existing completed tasks are treated as validated by the mentor
UPDATE public.session_tasks
  SET validated_at = COALESCE(validated_at, completed_at, now()),
      completed_by_role = COALESCE(completed_by_role, 'mentor')
  WHERE is_completed = true;
