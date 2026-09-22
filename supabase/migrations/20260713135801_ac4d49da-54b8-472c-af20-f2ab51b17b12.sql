DELETE FROM booking_reports WHERE booking_id IN ('e3d06967-dd20-43b1-a718-1e1a29bb2b2d','500e500e-33be-4ff0-a764-002e509a3d33');
DELETE FROM session_tasks WHERE booking_id IN ('e3d06967-dd20-43b1-a718-1e1a29bb2b2d','500e500e-33be-4ff0-a764-002e509a3d33');
DELETE FROM student_tools WHERE liberty_id = '3a5ba527-ef31-466c-aac1-2f3110b36ec9';
DELETE FROM bookings WHERE liberty_id = '3a5ba527-ef31-466c-aac1-2f3110b36ec9';
DELETE FROM profiles WHERE id = '3a5ba527-ef31-466c-aac1-2f3110b36ec9';