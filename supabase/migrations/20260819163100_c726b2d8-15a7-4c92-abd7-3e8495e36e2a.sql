DO $$
DECLARE
  r record;
  v_keeper public.profiles;
  v_dup public.profiles;
  v_json jsonb;
BEGIN
  FOR r IN
    SELECT k.id AS keeper_id, d.id AS dup_id
    FROM public.profiles k
    JOIN public.profiles d ON d.email = k.email AND d.id <> k.id
    WHERE k.user_id IS NOT NULL AND d.user_id IS NULL AND k.email IS NOT NULL
  LOOP
    SELECT * INTO v_keeper FROM public.profiles WHERE id = r.keeper_id;
    SELECT * INTO v_dup FROM public.profiles WHERE id = r.dup_id;
    IF v_keeper.id IS NULL OR v_dup.id IS NULL THEN CONTINUE; END IF;

    -- keeper values win; dup fills only the gaps
    v_json := jsonb_strip_nulls(to_jsonb(v_dup)) || jsonb_strip_nulls(to_jsonb(v_keeper));
    v_json := v_json - 'created_at' - 'updated_at';
    v_keeper := jsonb_populate_record(v_keeper, v_json);

    UPDATE public.profiles SET
      full_name = v_keeper.full_name,
      phone = v_keeper.phone,
      avatar_url = v_keeper.avatar_url,
      company_name = v_keeper.company_name,
      program_start_date = v_keeper.program_start_date,
      program_end_date = v_keeper.program_end_date,
      session_rate = v_keeper.session_rate,
      member_tier = v_keeper.member_tier,
      birth_date = v_keeper.birth_date,
      instagram_personal = v_keeper.instagram_personal,
      city_state = v_keeper.city_state,
      marital_status = v_keeper.marital_status,
      dietary_restriction = v_keeper.dietary_restriction,
      favorite_chocolate = v_keeper.favorite_chocolate,
      personal_story = v_keeper.personal_story,
      company_segment = v_keeper.company_segment,
      company_address = v_keeper.company_address,
      business_description = v_keeper.business_description,
      company_instagram = v_keeper.company_instagram,
      business_age = v_keeper.business_age,
      employees_count = v_keeper.employees_count,
      monthly_revenue = v_keeper.monthly_revenue,
      profit_margin = v_keeper.profit_margin,
      would_buy_self = v_keeper.would_buy_self,
      financial_control = v_keeper.financial_control,
      uses_dre = v_keeper.uses_dre,
      costs_expenses = v_keeper.costs_expenses,
      financial_challenge = v_keeper.financial_challenge,
      challenge_2026 = v_keeper.challenge_2026,
      dream_2026 = v_keeper.dream_2026,
      program_expectation = v_keeper.program_expectation,
      sector_to_develop = v_keeper.sector_to_develop,
      vision_6_months = v_keeper.vision_6_months,
      main_pain = v_keeper.main_pain,
      admin_note = v_keeper.admin_note,
      employees_count_num = v_keeper.employees_count_num,
      leaders_count = v_keeper.leaders_count,
      business_story = v_keeper.business_story,
      onboarding_completed = (v_keeper.onboarding_completed OR v_dup.onboarding_completed)
    WHERE id = r.keeper_id;

    -- move history
    UPDATE public.bookings SET liberty_id = r.keeper_id WHERE liberty_id = r.dup_id;
    UPDATE public.bookings SET mentor_id = r.keeper_id WHERE mentor_id = r.dup_id;
    UPDATE public.mentor_availability SET mentor_id = r.keeper_id WHERE mentor_id = r.dup_id;
    UPDATE public.mentor_sessions SET mentor_id = r.keeper_id WHERE mentor_id = r.dup_id;
    UPDATE public.student_tools SET liberty_id = r.keeper_id WHERE liberty_id = r.dup_id;
    UPDATE public.student_tools SET uploaded_by = r.keeper_id WHERE uploaded_by = r.dup_id;
    UPDATE public.tool_applications SET member_id = r.keeper_id WHERE member_id = r.dup_id;
    UPDATE public.tool_applications SET applied_by = r.keeper_id WHERE applied_by = r.dup_id;
    UPDATE public.member_points SET member_id = r.keeper_id WHERE member_id = r.dup_id;
    UPDATE public.member_testimonials SET member_id = r.keeper_id WHERE member_id = r.dup_id;
    UPDATE public.featured_case_of_day SET member_id = r.keeper_id WHERE member_id = r.dup_id;
    UPDATE public.nps_responses SET liberty_id = r.keeper_id WHERE liberty_id = r.dup_id;
    UPDATE public.nps_responses SET mentor_id = r.keeper_id WHERE mentor_id = r.dup_id;
    UPDATE public.session_tasks SET created_by_mentor_id = r.keeper_id WHERE created_by_mentor_id = r.dup_id;
    UPDATE public.session_tasks SET validated_by = r.keeper_id WHERE validated_by = r.dup_id;
    DELETE FROM public.user_oauth_tokens WHERE profile_id = r.dup_id;
    DELETE FROM public.profile_user_lookup WHERE profile_id = r.dup_id;
    DELETE FROM public.nps_mentor_options WHERE profile_id = r.dup_id;

    DELETE FROM public.profiles WHERE id = r.dup_id;
  END LOOP;
END $$;

-- Evita novos cadastros duplicados por e-mail
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_idx
  ON public.profiles (lower(email)) WHERE email IS NOT NULL;