
-- Add program tracking fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS company_name text,
ADD COLUMN IF NOT EXISTS program_start_date date,
ADD COLUMN IF NOT EXISTS program_end_date date;

-- Add session_value to system_config for financial calculations
INSERT INTO public.system_config (key, value) VALUES ('session_value', '900')
ON CONFLICT (key) DO NOTHING;
