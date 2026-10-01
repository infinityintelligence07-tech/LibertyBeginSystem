-- Sessão realizada que não entra no repasse do mentor.
-- A linha do tempo e a jornada do aluno continuam iguais.
alter table public.bookings
  add column if not exists payout_excluded boolean not null default false;

comment on column public.bookings.payout_excluded is
  'Quando verdadeiro, a sessão realizada não entra no financeiro do mentor.';

-- Financeiro 1 do Ulisses com a Morgana: repetiu a sessão do Reinaldo. Sem repasse.
update public.bookings
set payout_excluded = true
where id = '29a61216-7814-4c47-8da3-c38a85ce6716';
