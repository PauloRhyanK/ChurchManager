-- CreateEnum
CREATE TYPE "WorshipSongStatus" AS ENUM ('DRAFT', 'NEEDS_TIMING', 'READY');

-- CreateEnum
CREATE TYPE "WorshipMomentKind" AS ENUM ('PRE_SERVICE', 'GENERIC', 'WORSHIP');

-- AlterEnum
ALTER TYPE "PermissionModule" ADD VALUE 'WORSHIP';

-- CreateTable
CREATE TABLE "worship_songs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "artist" VARCHAR(255),
    "musical_key" VARCHAR(16),
    "bpm" INTEGER,
    "time_signature" VARCHAR(8),
    "raw_lyrics" TEXT NOT NULL DEFAULT '',
    "rows" JSONB NOT NULL DEFAULT '[]',
    "status" "WorshipSongStatus" NOT NULL DEFAULT 'DRAFT',
    "audio_url" VARCHAR(512),
    "audio_file_name" VARCHAR(255),
    "audio_duration_seconds" DOUBLE PRECISION,
    "audio_size_bytes" INTEGER,
    "ready_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worship_songs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worship_service_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "moments" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worship_service_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worship_services" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "template_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worship_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worship_service_moments" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "WorshipMomentKind" NOT NULL DEFAULT 'GENERIC',
    "duration_minutes" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "worship_service_moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worship_service_songs" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "song_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "worship_service_songs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worship_songs_tenant_id_status_idx" ON "worship_songs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "worship_songs_tenant_id_title_idx" ON "worship_songs"("tenant_id", "title");

-- CreateIndex
CREATE INDEX "worship_service_templates_tenant_id_idx" ON "worship_service_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "worship_services_tenant_id_date_idx" ON "worship_services"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "worship_service_moments_service_id_idx" ON "worship_service_moments"("service_id");

-- CreateIndex
CREATE INDEX "worship_service_songs_service_id_idx" ON "worship_service_songs"("service_id");

-- CreateIndex
CREATE INDEX "worship_service_songs_song_id_idx" ON "worship_service_songs"("song_id");

-- AddForeignKey
ALTER TABLE "worship_songs" ADD CONSTRAINT "worship_songs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worship_service_templates" ADD CONSTRAINT "worship_service_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worship_services" ADD CONSTRAINT "worship_services_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worship_services" ADD CONSTRAINT "worship_services_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "worship_service_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worship_service_moments" ADD CONSTRAINT "worship_service_moments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "worship_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worship_service_songs" ADD CONSTRAINT "worship_service_songs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "worship_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worship_service_songs" ADD CONSTRAINT "worship_service_songs_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "worship_songs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

