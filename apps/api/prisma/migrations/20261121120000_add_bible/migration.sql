-- CreateTable
CREATE TABLE "bible_translations" (
    "id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "short_name" VARCHAR(32) NOT NULL,
    "license" VARCHAR(255) NOT NULL,
    "attribution" TEXT NOT NULL,
    "source_url" VARCHAR(512) NOT NULL,
    "source_version" VARCHAR(32) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bible_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_verses" (
    "translation_id" UUID NOT NULL,
    "book" SMALLINT NOT NULL,
    "chapter" SMALLINT NOT NULL,
    "verse" SMALLINT NOT NULL,
    "text" TEXT NOT NULL,
    "search_text" TEXT NOT NULL,

    CONSTRAINT "bible_verses_pkey" PRIMARY KEY ("translation_id","book","chapter","verse")
);

-- CreateIndex
CREATE UNIQUE INDEX "bible_translations_code_key" ON "bible_translations"("code");

-- AddForeignKey
ALTER TABLE "bible_verses" ADD CONSTRAINT "bible_verses_translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "bible_translations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
