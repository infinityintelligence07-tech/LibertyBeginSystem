-- Varredura de transcrições do Meet: sessões encerradas (mesmo sem clicar em Encerrar) recebem a transcrição no relatório.
insert into public.system_config (key, value)
values ('meeting_sweep_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'meeting-artifacts-sweep';

select cron.schedule(
  'meeting-artifacts-sweep',
  '*/3 * * * *',
  $$
  select net.http_post(
    url := 'https://roddclbsxqrlgmxvjsqr.supabase.co/functions/v1/meeting-control',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sweep-secret', (select value from public.system_config where key = 'meeting_sweep_secret')
    ),
    body := '{"action":"sweep"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
