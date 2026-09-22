
-- Remove job antigo se existir
SELECT cron.unschedule('report-overdue-nudges') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='report-overdue-nudges');

-- Roda todo dia às 12:00 UTC (09:00 BRT)
SELECT cron.schedule(
  'report-overdue-nudges',
  '0 12 * * *',
  $$SELECT public.dispatch_report_nudges();$$
);
