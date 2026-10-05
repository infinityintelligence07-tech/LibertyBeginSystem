-- Marca quando o Doc do Gemini foi liberado para quem tiver o link.
alter table public.bookings
  add column if not exists meeting_smart_notes_shared_at timestamptz;

comment on column public.bookings.meeting_smart_notes_shared_at is
  'Quando o documento do Gemini passou a abrir para qualquer pessoa com o link.';
