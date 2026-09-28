-- Varredura de salas Meet: sessões agendadas sem link (criadas antes do Meet, ou quando a criação
-- pela tela falhou) recebem a sala e o convite na agenda da host, do mentor e do membro.
-- Usa o mesmo segredo da varredura de transcrições (meeting_sweep_secret).
insert into public.system_config (key, value)
values ('meeting_sweep_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'meeting-provision-sweep';

select cron.schedule(
  'meeting-provision-sweep',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://roddclbsxqrlgmxvjsqr.supabase.co/functions/v1/provision-meeting',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sweep-secret', (select value from public.system_config where key = 'meeting_sweep_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
