-- Resumo da sessão gerado por IA a partir da transcrição do Meet: aparece na tela da sessão e vai por e-mail ao mentor (co-host).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS meeting_summary_text text,
  ADD COLUMN IF NOT EXISTS meeting_summary_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_summary_emailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_summary_email_error text,
  ADD COLUMN IF NOT EXISTS meeting_summary_claimed_at timestamptz;

COMMENT ON COLUMN public.bookings.meeting_summary_text IS 'Resumo da sessão gerado por IA a partir da transcrição do Meet.';
COMMENT ON COLUMN public.bookings.meeting_summary_emailed_at IS 'Quando o resumo foi enviado por e-mail ao mentor (co-host) pelo Gmail da conta host.';
COMMENT ON COLUMN public.bookings.meeting_summary_email_error IS 'Último erro ao gerar/enviar o resumo; limpo quando o envio dá certo.';
COMMENT ON COLUMN public.bookings.meeting_summary_claimed_at IS 'Trava curta para que poll, varredura e tela não gerem/enviem o resumo em dobro.';
