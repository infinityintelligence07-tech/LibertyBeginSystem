
-- 1. Remove exact duplicates (same member + session + date + time + mentor) keeping oldest
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY liberty_id, session_id, scheduled_date, start_time, mentor_id
           ORDER BY created_at ASC
         ) AS rn
  FROM public.bookings
  WHERE liberty_id IS NOT NULL
)
DELETE FROM public.bookings b
USING ranked r
WHERE b.id = r.id AND r.rn > 1;

-- 2. For same liberty+session with different dates/mentors, keep the oldest non-cancelled, cancel the rest
WITH ranked AS (
  SELECT id, status,
         ROW_NUMBER() OVER (
           PARTITION BY liberty_id, session_id
           ORDER BY 
             CASE WHEN status = 'completed' THEN 0 ELSE 1 END,
             created_at ASC
         ) AS rn
  FROM public.bookings
  WHERE liberty_id IS NOT NULL AND status <> 'cancelled'
)
UPDATE public.bookings b
SET status = 'cancelled',
    cancellation_reason = COALESCE(b.cancellation_reason, 'Duplicada - removida automaticamente')
FROM ranked r
WHERE b.id = r.id AND r.rn > 1;

-- 3. Prevent future duplicates: unique non-cancelled booking per (liberty_id, session_id)
CREATE UNIQUE INDEX IF NOT EXISTS bookings_unique_liberty_session_active
ON public.bookings (liberty_id, session_id)
WHERE liberty_id IS NOT NULL AND status <> 'cancelled';
