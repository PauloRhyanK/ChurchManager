ALTER TABLE "worship_settings"
  ADD COLUMN "lyric_max_chars" INTEGER NOT NULL DEFAULT 28,
  ADD COLUMN "lyric_max_lines" INTEGER NOT NULL DEFAULT 3;
