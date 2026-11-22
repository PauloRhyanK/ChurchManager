-- Garante os limites de letra em "worship_settings" depois que a tabela existe
-- (ver 20261122120000_lyrics_slide_limits). Idempotente: onde as colunas já existem, não faz nada.
ALTER TABLE "worship_settings"
  ADD COLUMN IF NOT EXISTS "lyric_max_chars" INTEGER NOT NULL DEFAULT 28,
  ADD COLUMN IF NOT EXISTS "lyric_max_lines" INTEGER NOT NULL DEFAULT 3;
