-- 05 · CORREÇÃO · Esequiel S. Rodrigues
-- Marca como REALIZADAS as sessões "SWOT/Tecnologia" e "Marketing de Tração" que já aconteceram
-- e ainda não estão como "completed" na plataforma.
-- Só mexe em sessões do Esequiel, com data no passado, que não estejam canceladas.
-- Se as sessões NEM EXISTIREM na plataforma, o script avisa: nesse caso registre pelo painel
-- (Admin → Membros → Esequiel → "Registrar sessão histórica"), uma por vez.
DO $$
DECLARE
  v_ids   uuid[];
  v_count int;
BEGIN
  SELECT array_agg(b.id), count(*)
    INTO v_ids, v_count
  FROM public.bookings b
  JOIN public.profiles p ON p.id = b.liberty_id
  JOIN public.sessions s ON s.id = b.session_id
  WHERE p.full_name ~* 'e[sz]equiel'
    AND (s.name ~* 'swot' OR s.name ~* 'tecnologia' OR s.name ~* 'marketing\s+de\s+tra')
    AND b.status IN ('scheduled','rescheduled','pending_approval','not_realized')
    AND b.scheduled_date <= current_date;

  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'Nenhuma sessão SWOT/Tecnologia/Marketing de Tração pendente do Esequiel foi encontrada. Ou já estão como realizadas, ou nunca foram agendadas na plataforma: registre pelo painel (Registrar sessão histórica). Confira com o 01-diagnostico-sessoes.sql.';
  END IF;

  UPDATE public.bookings
     SET status = 'completed',
         approval_required = false,
         cancellation_reason = NULL,
         updated_at = now()
   WHERE id = ANY (v_ids);
  -- Efeitos automáticos: +10 pontos por sessão (ranking); se não houver relatório, o mentor
  -- recebe a notificação "Preencha o relatório" e a sessão aparece como "Realizada · aguardando relatório".

  RAISE NOTICE 'OK: % sessão(ões) do Esequiel marcada(s) como realizada(s): %', v_count, v_ids;
END $$;

-- Conferência
SELECT s.name, b.status, b.scheduled_date, m.full_name AS mentor,
       (br.id IS NOT NULL) AS tem_relatorio
FROM public.bookings b
JOIN public.profiles p ON p.id = b.liberty_id
JOIN public.sessions s ON s.id = b.session_id
LEFT JOIN public.profiles m ON m.id = b.mentor_id
LEFT JOIN public.booking_reports br ON br.booking_id = b.id
WHERE p.full_name ~* 'e[sz]equiel'
ORDER BY b.scheduled_date, b.start_time;
