-- Mentores calculam o repasse na própria tela, mas system_config só era
-- legível por admin. Sem a linha, o painel caía no padrão antigo (mapeamento R$ 600).
-- Esta policy libera só os dois valores de sessão, nunca o restante da config.

drop policy if exists "Mentors can read session fees" on public.system_config;

create policy "Mentors can read session fees"
  on public.system_config
  for select
  to authenticated
  using (
    key in ('session_value', 'kickoff_session_value')
    and public.has_role(auth.uid(), 'mentor'::public.app_role)
  );
