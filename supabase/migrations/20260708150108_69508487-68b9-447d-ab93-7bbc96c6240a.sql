-- Add 'not_realized' status for mentor-reported no-shows awaiting admin review
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'not_realized';