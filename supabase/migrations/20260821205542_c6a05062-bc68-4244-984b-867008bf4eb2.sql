CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id
  FROM public.profiles
  WHERE email IS NOT NULL
    AND lower(email) = lower(NEW.email)
    AND user_id IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.profiles
    SET user_id = NEW.id,
        full_name = COALESCE(NULLIF(full_name, ''), NEW.raw_user_meta_data->>'full_name', NEW.email),
        updated_at = now()
    WHERE id = existing_id;
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$;