-- 04 · CORREÇÃO · Alexandre Ribeiro da Silva
-- Cancela o "Mapeamento do Negócio" agendado indevidamente como sessão 10
-- (regra: Mapeamento só até a 3ª sessão realizada) e libera o horário do mentor.
-- O script só executa se encontrar EXATAMENTE 1 Mapeamento ainda não realizado.
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
  WHERE p.full_name ~* 'alexandre\s+ribeiro'
    AND s.is_kickoff = true
    AND b.status IN ('scheduled','rescheduled','pending_approval');

  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'Nenhum Mapeamento pendente do Alexandre foi encontrado (talvez já esteja "completed"). Rode o 01-diagnostico-sessoes.sql e me envie o print.';
  ELSIF v_count > 1 THEN
    RAISE EXCEPTION 'Foram encontrados % Mapeamentos do Alexandre (ids: %). Nada foi alterado.', v_count, v_ids;
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled',
         cancellation_reason = 'Mapeamento do Negócio só pode ser agendado até a 3ª sessão realizada (ajuste administrativo 23/09/2026)',
         updated_at = now()
   WHERE id = v_ids[1];
  -- trg_sync_availability_booked libera o horário do mentor automaticamente ao cancelar

  UPDATE public.notifications
     SET read_at = COALESCE(read_at, now())
   WHERE related_booking_id = v_ids[1];

  RAISE NOTICE 'OK: Mapeamento (%) do Alexandre cancelado e horário liberado.', v_ids[1];
END $$;

-- Conferência
SELECT s.name, s.is_kickoff, b.status, b.scheduled_date, m.full_name AS mentor
FROM public.bookings b
JOIN public.profiles p ON p.id = b.liberty_id
JOIN public.sessions s ON s.id = b.session_id
LEFT JOIN public.profiles m ON m.id = b.mentor_id
WHERE p.full_name ~* 'alexandre\s+ribeiro'
ORDER BY b.scheduled_date, b.start_time;
