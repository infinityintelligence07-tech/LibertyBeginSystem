
-- 1) Add tier column to sessions
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'begin'
    CHECK (tier IN ('begin', 'liberty'));

-- Mark all existing sessions explicitly as 'begin' (they already are via default)
UPDATE public.sessions SET tier = 'begin' WHERE tier IS NULL OR tier = '';

-- 2) Insert the 7 Liberty-exclusive sessions (idempotent by name+tier)
INSERT INTO public.sessions (name, "order", tier, is_active)
SELECT v.name, v.ord, 'liberty', true
FROM (VALUES
  ('Mapeamento do Sucesso Empresarial', 101),
  ('Alinhamento de Valores',            102),
  ('Posicionamento de Papéis',          103),
  ('Sessão de Marketing',               104),
  ('SWOT Estratégico',                  105),
  ('Mapa de Potencial',                 106),
  ('EAG',                               107)
) AS v(name, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sessions s
  WHERE s.tier = 'liberty' AND lower(s.name) = lower(v.name)
);
