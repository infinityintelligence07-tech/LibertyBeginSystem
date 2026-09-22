
-- 1) Add detailed member profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS instagram_personal text,
  ADD COLUMN IF NOT EXISTS city_state text,
  ADD COLUMN IF NOT EXISTS marital_status text,
  ADD COLUMN IF NOT EXISTS dietary_restriction text,
  ADD COLUMN IF NOT EXISTS favorite_chocolate text,
  ADD COLUMN IF NOT EXISTS personal_story text,
  ADD COLUMN IF NOT EXISTS company_segment text,
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS company_instagram text,
  ADD COLUMN IF NOT EXISTS business_age text,
  ADD COLUMN IF NOT EXISTS employees_count text,
  ADD COLUMN IF NOT EXISTS monthly_revenue text,
  ADD COLUMN IF NOT EXISTS profit_margin text,
  ADD COLUMN IF NOT EXISTS would_buy_self text,
  ADD COLUMN IF NOT EXISTS financial_control text,
  ADD COLUMN IF NOT EXISTS uses_dre text,
  ADD COLUMN IF NOT EXISTS costs_expenses text,
  ADD COLUMN IF NOT EXISTS financial_challenge text,
  ADD COLUMN IF NOT EXISTS challenge_2026 text,
  ADD COLUMN IF NOT EXISTS dream_2026 text,
  ADD COLUMN IF NOT EXISTS program_expectation text,
  ADD COLUMN IF NOT EXISTS sector_to_develop text,
  ADD COLUMN IF NOT EXISTS vision_6_months text,
  ADD COLUMN IF NOT EXISTS main_pain text;

-- 2) Tighten profile visibility: drop the open SELECT policy and replace
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Owner can see own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Mentors and admins can see all profiles in full
CREATE POLICY "Mentors can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'mentor'::app_role));

-- 3) Public-safe view for member-to-member discovery
CREATE OR REPLACE VIEW public.public_member_profiles
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.full_name,
  p.avatar_url,
  p.company_name,
  p.company_segment,
  p.company_instagram,
  p.phone,
  p.member_tier
FROM public.profiles p;

GRANT SELECT ON public.public_member_profiles TO authenticated;
