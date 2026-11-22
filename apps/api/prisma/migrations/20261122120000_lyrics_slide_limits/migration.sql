-- Esta migração tem timestamp anterior à 20261123120000_add_worship_timing, que cria
-- "worship_settings". Em banco novo ela roda antes da tabela existir; por isso só
-- altera a tabela quando ela já existe (bancos em que add_worship_timing já foi aplicada,
-- como produção). Em banco novo as colunas vêm da 20261123120100_worship_settings_lyric_limits.
DO $$
BEGIN
  IF to_regclass('worship_settings') IS NOT NULL THEN
    ALTER TABLE "worship_settings"
      ADD COLUMN IF NOT EXISTS "lyric_max_chars" INTEGER NOT NULL DEFAULT 28,
      ADD COLUMN IF NOT EXISTS "lyric_max_lines" INTEGER NOT NULL DEFAULT 3;
  END IF;
END $$;
