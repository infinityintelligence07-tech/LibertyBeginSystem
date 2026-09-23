-- 03 · CORREÇÃO · Kaoru Sasaki
-- Cancela a sessão "Vendas" com a Djeniffer (cancelada fora da plataforma).
-- Efeito: o Mapeamento do Negócio (Rinaldo) passa a ser a sessão 01 e "Vendas" volta a "pendente".
-- O script só executa se encontrar EXATAMENTE 1 sessão. Caso contrário, não altera nada.
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
  LEFT JOIN public.profiles m ON m.id = b.mentor_id
  WHERE p.full_name ~* 'kaoru'
    AND s.name ~* '^vendas'
    AND b.status <> 'cancelled'
    AND (m.full_name ~* 'djen' OR b.scheduled_date = DATE '2026-09-17');

  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'Nenhuma sessão "Vendas" ativa da Kaoru foi encontrada. Rode o 01-diagnostico-sessoes.sql e me envie o print.';
  ELSIF v_count > 1 THEN
    RAISE EXCEPTION 'Foram encontradas % sessões "Vendas" da Kaoru (ids: %). Nada foi alterado. Me envie o print do diagnóstico.', v_count, v_ids;
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled',
         cancellation_reason = 'Cancelada fora da plataforma (ajuste administrativo 23/09/2026)',
         updated_at = now()
   WHERE id = v_ids[1];

  -- pontos de "sessão realizada" que tenham sido creditados indevidamente
  DELETE FROM public.member_points
   WHERE related_booking_id = v_ids[1] AND reason = 'session_completed';

  -- notificações pendentes ligadas a essa sessão (relatório pendente etc.)
  UPDATE public.notifications
     SET read_at = COALESCE(read_at, now())
   WHERE related_booking_id = v_ids[1];

  RAISE NOTICE 'OK: sessão Vendas (%) da Kaoru cancelada. O Mapeamento agora é a sessão 01.', v_ids[1];
END $$;

-- Conferência: deve mostrar a Vendas como "cancelled" e o Mapeamento como primeira sessão válida
SELECT s.name, b.status, b.scheduled_date, m.full_name AS mentor
FROM public.bookings b
JOIN public.profiles p ON p.id = b.liberty_id
JOIN public.sessions s ON s.id = b.session_id
LEFT JOIN public.profiles m ON m.id = b.mentor_id
WHERE p.full_name ~* 'kaoru'
ORDER BY b.scheduled_date, b.start_time;
