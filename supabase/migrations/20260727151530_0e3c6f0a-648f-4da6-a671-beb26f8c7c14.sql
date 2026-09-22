CREATE TABLE public.tool_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text,
  result_type text NOT NULL DEFAULT 'radar',
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tool_templates TO authenticated;
GRANT ALL ON public.tool_templates TO service_role;
ALTER TABLE public.tool_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read templates" ON public.tool_templates
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage templates" ON public.tool_templates
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

GRANT INSERT, UPDATE, DELETE ON public.tool_templates TO authenticated;

CREATE TABLE public.tool_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.tool_templates(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  applied_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'in_progress',
  phase text NOT NULL DEFAULT 'inicial',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tool_applications_status_check CHECK (status IN ('in_progress','completed')),
  CONSTRAINT tool_applications_phase_check CHECK (phase IN ('inicial','final'))
);

CREATE INDEX idx_tool_applications_member ON public.tool_applications(member_id);
CREATE INDEX idx_tool_applications_template ON public.tool_applications(template_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tool_applications TO authenticated;
GRANT ALL ON public.tool_applications TO service_role;
ALTER TABLE public.tool_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mentors and admins manage applications" ON public.tool_applications
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'mentor')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Member reads own completed applications" ON public.tool_applications
FOR SELECT TO authenticated
USING (
  status = 'completed'
  AND member_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE TRIGGER update_tool_templates_updated_at
BEFORE UPDATE ON public.tool_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tool_applications_updated_at
BEFORE UPDATE ON public.tool_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.tool_templates (slug, name, description, icon, result_type, sort_order)
VALUES (
  'diagnostico-begin',
  'Diagnóstico Begin',
  'Sessão de mapeamento inicial: 7 pilares que geram o radar da maturidade da empresa.',
  'radar',
  'radar',
  1
);