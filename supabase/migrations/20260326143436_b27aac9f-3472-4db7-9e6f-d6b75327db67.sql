ALTER TABLE public.sessions ADD COLUMN cover_image_url text;

UPDATE public.sessions SET cover_image_url = '/images/capa_mapa_do_negocio.png' WHERE name ILIKE '%mapa do neg%';