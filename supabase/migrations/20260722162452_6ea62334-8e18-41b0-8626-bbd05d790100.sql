
-- Add "kickoff" flag so we can mark the mandatory first session
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS is_kickoff boolean NOT NULL DEFAULT false;

-- Deactivate the old "Mapa do Negócio" (data preserved)
UPDATE public.sessions
   SET is_active = false,
       "order"   = 999
 WHERE id = '872a8a17-e404-4acc-8136-cc16457097f8';

-- Insert the new mandatory Kickoff session "Mapeamento do Negócio" (3h)
INSERT INTO public.sessions (name, description, duration_minutes, "order", is_active, tier, is_kickoff)
VALUES (
  'Mapeamento do Negócio',
  'Sessão especial de kickoff (3 horas). Fazemos um mapeamento completo da empresa — situação financeira, marketing, cultura, processos, cada setor — e definimos os objetivos que a jornada vai desdobrar. É a sessão que destrava todas as demais.',
  180,
  1,
  true,
  'begin',
  true
);
