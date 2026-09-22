CREATE TABLE public.profile_merge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_id uuid NOT NULL,
  loser_id uuid NOT NULL,
  winner_name text,
  loser_name text,
  winner_before jsonb NOT NULL,
  loser_before jsonb NOT NULL,
  moved jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid,
  undone_at timestamp with time zone,
  undone_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profile_merge_log TO authenticated;
GRANT ALL ON public.profile_merge_log TO service_role;

ALTER TABLE public.profile_merge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view merge log"
ON public.profile_merge_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_profile_merge_log_updated_at
BEFORE UPDATE ON public.profile_merge_log
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();