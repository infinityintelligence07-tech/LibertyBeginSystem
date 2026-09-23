-- 07 · DIAGNÓSTICO · Michel Bidri
-- Lista as sessões do membro cujo nome contém "bidri" (ou "michel").
-- Só leitura. Cole no SQL Editor do projeto roddclbsxqrlgmxvjsqr e rode (Run).
-- Me envie o print do resultado se houver mais de uma "não realizada".

SELECT
  b.id,
  p.full_name AS membro,
  s.name AS sessao,
  s."order" AS ordem,
  m.full_name AS mentor,
  b.scheduled_date AS data,
  b.start_time AS inicio,
  b.end_time AS fim,
  b.status AS status_banco,
  b.cancellation_reason AS motivo,
  b.is_retroactive AS retroativa,
  b.report_required AS exige_relatorio,
  EXISTS (
    SELECT 1 FROM public.booking_reports r WHERE r.booking_id = b.id
  ) AS tem_relatorio,
  CASE
    WHEN b.status = 'not_realized' THEN '← esta está como NÃO REALIZADA'
    WHEN b.status = 'completed' THEN 'realizada'
    WHEN b.status = 'cancelled' THEN 'cancelada'
    WHEN b.status = 'scheduled' THEN 'agendada'
    ELSE b.status
  END AS leitura
FROM public.bookings b
JOIN public.profiles p ON p.id = b.liberty_id
LEFT JOIN public.sessions s ON s.id = b.session_id
LEFT JOIN public.profiles m ON m.id = b.mentor_id
WHERE p.full_name ~* 'bidri'
   OR p.full_name ~* 'michel'
ORDER BY b.scheduled_date DESC, b.start_time DESC;
