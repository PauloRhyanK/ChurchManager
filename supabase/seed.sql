-- seed.sql – sample data for local development
-- Run after applying migrations: supabase db reset

-- Insert a demo tenant
INSERT INTO public.tenants (id, name, slug)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Igreja Paraíso',
  'igreja-paraiso'
) ON CONFLICT DO NOTHING;

-- Insert sample events
INSERT INTO public.events (tenant_id, title, date, description, is_active)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Culto de Domingo',
    NOW() + INTERVAL '3 days',
    'Culto dominical com louvor e pregação',
    TRUE
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Reunião de Jovens',
    NOW() + INTERVAL '7 days',
    'Encontro semanal do grupo de jovens',
    TRUE
  );

-- Insert sample site sections
INSERT INTO public.site_sections (tenant_id, section_key, content)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'hero_section',
    '{"title": "Bem-vindo à Igreja Paraíso", "subtitle": "Um lugar de fé, esperança e amor", "cta_text": "Conheça nossa comunidade"}'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'about_us',
    '{"title": "Sobre Nós", "text": "Somos uma comunidade cristã comprometida com a Palavra de Deus e com o crescimento espiritual de cada membro."}'
  )
ON CONFLICT ON CONSTRAINT uq_tenant_section DO NOTHING;
