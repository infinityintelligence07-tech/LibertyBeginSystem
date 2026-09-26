-- Valores padrão de repasse ao mentor:
-- sessão normal R$ 300 · Mapeamento do Negócio (3h) R$ 600.

INSERT INTO public.system_config (key, value)
VALUES ('session_value', '300')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.system_config (key, value)
VALUES ('kickoff_session_value', '600')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
