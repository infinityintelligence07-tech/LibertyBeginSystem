-- 01 · DIAGNÓSTICO (somente leitura) · sessões de Kaoru, Alexandre Ribeiro e Esequiel
-- Cole tudo no SQL Editor e clique em Run. Nada é alterado.
SELECT
  p.full_name                                   AS membro,
  p.member_tier                                 AS plano,
  s.name                                        AS sessao,
  s."order"                                     AS ordem_catalogo,
  s.tier                                        AS tier_sessao,
  s.is_active                                   AS sessao_ativa,
  s.is_kickoff                                  AS mapeamento,
  b.status                                      AS status_gravado,
  CASE
    WHEN b.status IN ('cancelled','not_realized','pending_approval','completed') THEN b.status::text
    WHEN (b.scheduled_date + COALESCE(b.end_time, b.start_time)) AT TIME ZONE 'America/Sao_Paulo' < now()
      THEN 'PASSOU E O MENTOR NÃO FECHOU (hoje conta como realizada)'
    ELSE 'agendada (futuro)'
  END                                           AS leitura,
  b.scheduled_date                              AS data,
  b.start_time                                  AS inicio,
  b.end_time                                    AS fim,
  m.full_name                                   AS mentor,
  (br.id IS NOT NULL)                           AS tem_relatorio,
  b.is_retroactive                              AS retroativa,
  b.report_required                             AS exige_relatorio,
  b.cancellation_reason                         AS motivo,
  b.id                                          AS booking_id,
  p.id                                          AS profile_id
FROM public.bookings b
JOIN public.profiles p   ON p.id = b.liberty_id
LEFT JOIN public.sessions s ON s.id = b.session_id
LEFT JOIN public.profiles m ON m.id = b.mentor_id
LEFT JOIN public.booking_reports br ON br.booking_id = b.id
WHERE p.full_name ~* '(kaoru|alexandre\s+ribeiro|e[sz]equiel)'
ORDER BY p.full_name, b.scheduled_date, b.start_time;
