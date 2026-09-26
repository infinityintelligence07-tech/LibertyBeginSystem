-- URL do Google Doc de Anota pra Mim / smart notes do Meet
alter table public.bookings
  add column if not exists meeting_smart_notes_url text;

comment on column public.bookings.meeting_smart_notes_url is
  'URL do Google Doc de Anota pra Mim / smart notes do Meet, quando a API devolver.';
