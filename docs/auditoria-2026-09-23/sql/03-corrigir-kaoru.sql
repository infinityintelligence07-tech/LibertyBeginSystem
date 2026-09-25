-- 03 · CORREÇÃO · Kaoru Sasaki (atualizado 25/09/2026)
-- Objetivo:
--   1) Cancelar a(s) sessão(ões) "Vendas" ainda ativas no mapa (não canceladas),
--      para a Vendas voltar a ficar pendente e poder ser agendada de novo.
--   2) Manter o "Mapeamento do Negócio" como a sessão 01 realizada.
--
-- Por que cancelar (e não "não realizada"):
--   o índice único `bookings_unique_liberty_session_active` só libera a sessão
--   para reagendar quando o status é `cancelled`.
--
-- Segurança: só altera se encontrar Kaoru + pelo menos 1 Vendas ativa.
-- Se houver mais de uma Vendas ativa, cancela todas (todas bloqueiam o reagendamento).

DO $$
DECLARE
  v_profile_id uuid;
  v_vendas_ids uuid[];
  v_vendas_count int;
  v_mapeamento_ids uuid[];
  v_mapeamento_count int;
BEGIN
  SELECT p.id
    INTO v_profile_id
  FROM public.profiles p
  WHERE p.full_name ~* 'kaoru'
  ORDER BY p.created_at NULLS LAST
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil do Kaoru não encontrado. Confira o nome em Admin → Membros.';
  END IF;

  SELECT array_agg(b.id ORDER BY b.scheduled_date, b.start_time), count(*)
    INTO v_mapeamento_ids, v_mapeamento_count
  FROM public.bookings b
  JOIN public.sessions s ON s.id = b.session_id
  WHERE b.liberty_id = v_profile_id
    AND COALESCE(s.is_kickoff, false) = true
    AND b.status <> 'cancelled';

  SELECT array_agg(b.id ORDER BY b.scheduled_date, b.start_time), count(*)
    INTO v_vendas_ids, v_vendas_count
  FROM public.bookings b
  JOIN public.sessions s ON s.id = b.session_id
  WHERE b.liberty_id = v_profile_id
    AND s.name ~* '^vendas'
    AND b.status <> 'cancelled';

  IF v_vendas_count IS NULL OR v_vendas_count = 0 THEN
    RAISE EXCEPTION 'Nenhuma sessão Vendas ativa do Kaoru. Pode já ter sido corrigida. Rode o SELECT de conferência no final.';
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled',
         cancellation_reason = 'Ajuste administrativo: Vendas agendada antes do Mapeamento. Liberada para remarcar (25/09/2026).',
         updated_at = now()
   WHERE id = ANY (v_vendas_ids);

  -- Pontos creditados indevidamente por essas sessões
  DELETE FROM public.member_points
   WHERE related_booking_id = ANY (v_vendas_ids)
     AND reason = 'session_completed';

  -- Marca notificações ligadas como lidas (evita alerta de cancelamento para o time)
  UPDATE public.notifications
     SET read_at = COALESCE(read_at, now())
   WHERE related_booking_id = ANY (v_vendas_ids);

  -- Se o Mapeamento ainda estiver só "scheduled" no passado, marca como realizada
  -- (a sessão com o mentor já aconteceu).
  IF v_mapeamento_count > 0 THEN
    UPDATE public.bookings b
       SET status = 'completed',
           updated_at = now()
     WHERE b.id = ANY (v_mapeamento_ids)
       AND b.status IN ('scheduled', 'rescheduled')
       AND (b.scheduled_date + COALESCE(b.end_time, b.start_time))
             AT TIME ZONE 'America/Sao_Paulo' <= now();
  END IF;

  RAISE NOTICE 'OK Kaoru (%): % Vendas cancelada(s) → %. Mapeamento ativo(s): %.',
    v_profile_id, v_vendas_count, v_vendas_ids, COALESCE(v_mapeamento_count, 0);
END $$;

-- Conferência: Vendas deve aparecer cancelled; Mapeamento completed (ou scheduled futuro).
SELECT
  s.name                                        AS sessao,
  COALESCE(s.is_kickoff, false)                 AS mapeamento,
  b.status                                      AS status,
  b.scheduled_date                              AS data,
  b.start_time                                  AS inicio,
  m.full_name                                   AS mentor,
  (br.id IS NOT NULL)                           AS tem_relatorio,
  b.cancellation_reason                         AS motivo,
  b.id                                          AS booking_id
FROM public.bookings b
JOIN public.profiles p ON p.id = b.liberty_id
JOIN public.sessions s ON s.id = b.session_id
LEFT JOIN public.profiles m ON m.id = b.mentor_id
LEFT JOIN public.booking_reports br ON br.booking_id = b.id
WHERE p.full_name ~* 'kaoru'
ORDER BY b.scheduled_date, b.start_time;
