
-- Table for tools attached to a student (and optionally to a session/booking)
CREATE TABLE public.student_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liberty_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('image','pdf')),
  file_size integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_tools TO authenticated;
GRANT ALL ON public.student_tools TO service_role;

ALTER TABLE public.student_tools ENABLE ROW LEVEL SECURITY;

-- Student sees their own tools
CREATE POLICY "Student reads own tools"
ON public.student_tools FOR SELECT
TO authenticated
USING (
  liberty_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Mentors and admins can see all tools
CREATE POLICY "Mentors and admins read all tools"
ON public.student_tools FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor') OR public.has_role(auth.uid(), 'admin')
);

-- Mentors and admins can insert
CREATE POLICY "Mentors and admins insert tools"
ON public.student_tools FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'mentor') OR public.has_role(auth.uid(), 'admin')
);

-- Mentors and admins can update
CREATE POLICY "Mentors and admins update tools"
ON public.student_tools FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor') OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'mentor') OR public.has_role(auth.uid(), 'admin')
);

-- Mentors and admins can delete
CREATE POLICY "Mentors and admins delete tools"
ON public.student_tools FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor') OR public.has_role(auth.uid(), 'admin')
);

-- Updated_at trigger
CREATE TRIGGER update_student_tools_updated_at
BEFORE UPDATE ON public.student_tools
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_student_tools_liberty ON public.student_tools(liberty_id);
CREATE INDEX idx_student_tools_booking ON public.student_tools(booking_id);

-- ============================================================
-- Storage policies for the private `student-tools` bucket
-- Path convention: <liberty_id>/<uuid>-<filename>
-- ============================================================

-- Student can read their own files (first path segment = their profile.id)
CREATE POLICY "Student reads own tool files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'student-tools'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Mentors and admins can read any tool file
CREATE POLICY "Mentors and admins read tool files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'student-tools'
  AND (public.has_role(auth.uid(), 'mentor') OR public.has_role(auth.uid(), 'admin'))
);

-- Mentors and admins can upload
CREATE POLICY "Mentors and admins upload tool files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'student-tools'
  AND (public.has_role(auth.uid(), 'mentor') OR public.has_role(auth.uid(), 'admin'))
);

-- Mentors and admins can delete
CREATE POLICY "Mentors and admins delete tool files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'student-tools'
  AND (public.has_role(auth.uid(), 'mentor') OR public.has_role(auth.uid(), 'admin'))
);
