ALTER TABLE public.student_tools
  ADD COLUMN IF NOT EXISTS external_url text,
  ALTER COLUMN file_name DROP NOT NULL,
  ALTER COLUMN file_path DROP NOT NULL;