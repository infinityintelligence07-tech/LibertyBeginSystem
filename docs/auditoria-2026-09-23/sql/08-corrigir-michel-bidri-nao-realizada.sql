-- 08 · CORREÇÃO · Michel Bidri
-- Volta para REALIZADA a(s) sessão(ões) que estão como "não realizada" por engano.
-- Só executa se encontrar EXATAMENTE 1 booking `not_realized` do Michel Bidri.
-- Se houver mais de uma, o script para sem alterar nada (rode o 07 e me diga qual data/sessão).
--
-- Como rodar: SQL Editor → New query → colar tudo → Run.

DO $$
DECLARE
  v_ids   uuid[];
  v_count int;
  v_id    uuid;
  v_info  text;
BEGIN
  SELECT array_agg(b.id), count(*)
    INTO v_ids, v_count
  FROM public.bookings b
  JOIN public.profiles p ON p.id = b.liberty_id
  WHERE p.full_name ~* 'bidri'
    AND b.status = 'not_realized';

  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'Nenhuma sessão "não realizada" do Michel Bidri foi encontrada. Rode o 07-diagnostico-michel-bidri.sql.';
  ELSIF v_count > 1 THEN
    RAISE EXCEPTION 'Há % sessões "não realizadas" do Bidri (ids: %). Nada foi alterado. Rode o 07, escolha a data/sessão e me diga qual corrigir.', v_count, v_ids;
  END IF;

  v_id := v_ids[1];

  SELECT format('%s · %s · %s · mentor %s',
           p.full_name,
           COALESCE(s.name, 'sem sessão'),
           b.scheduled_date::text,
           COALESCE(m.full_name, '—'))
    INTO v_info
  FROM public.bookings b
  JOIN public.profiles p ON p.id = b.liberty_id
  LEFT JOIN public.sessions s ON s.id = b.session_id
  LEFT JOIN public.profiles m ON m.id = b.mentor_id
  WHERE b.id = v_id;

  UPDATE public.bookings
     SET status = 'completed',
         cancellation_reason = NULL,
         updated_at = now()
   WHERE id = v_id;

  -- Se a sessão exige relatório e já existe um, ok.
  -- Pontos: o trigger de completed pode (re)creditar; se já existir ponto, o unique evita duplicar.
  -- Notificações de "não realizada" marcamos como lidas.
  UPDATE public.notifications
     SET read_at = COALESCE(read_at, now())
   WHERE related_booking_id = v_id
     AND type IN ('booking_not_realized', 'session_not_realized');

  RAISE NOTICE 'OK: sessão voltou para realizada → % (id %)', v_info, v_id;
END $$;
