
CREATE INDEX IF NOT EXISTS idx_bookings_mentor_date ON public.bookings (mentor_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_liberty_date ON public.bookings (liberty_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_date ON public.bookings (scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_session_id ON public.bookings (session_id);
CREATE INDEX IF NOT EXISTS idx_profiles_member_tier ON public.profiles (member_tier) WHERE member_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON public.profiles (full_name);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_session_tasks_booking_id ON public.session_tasks (booking_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_mentor_availability_mentor ON public.mentor_availability (mentor_id);
