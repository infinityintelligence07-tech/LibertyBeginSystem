-- Texto da transcrição/resumo puxado da Meet API após Encerrar (para pré-preencher o relatório).
-- meeting_ended_at: some o card "Ao vivo" do Início mesmo antes do horário oficial terminar.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS meeting_transcript_text text,
  ADD COLUMN IF NOT EXISTS meeting_artifacts_status text,
  ADD COLUMN IF NOT EXISTS meeting_artifacts_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_ended_at timestamptz;

COMMENT ON COLUMN public.bookings.meeting_transcript_text IS 'Transcrição (entries) ou texto bruto obtido via Meet API após encerrar.';
COMMENT ON COLUMN public.bookings.meeting_artifacts_status IS 'pending | ready | unavailable | null';
COMMENT ON COLUMN public.bookings.meeting_ended_at IS 'Quando o mentor/admin encerrou a call Meet via plataforma.';
