
DELETE FROM public.bookings WHERE id = '226ac064-78c8-40f1-b320-110fd847d778';

CREATE UNIQUE INDEX IF NOT EXISTS bookings_unique_active_mentor_slot
  ON public.bookings (mentor_id, scheduled_date, start_time)
  WHERE status IN ('scheduled','pending_approval','rescheduled');
