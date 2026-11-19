-- CreateTable
CREATE TABLE "worship_settings" (
    "tenant_id" UUID NOT NULL,
    "slide_lead_seconds" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worship_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "worship_timing_corrections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "song_id" UUID NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "instruction" VARCHAR(300),
    "changed_slides" INTEGER NOT NULL,
    "mean_delta_seconds" DOUBLE PRECISION NOT NULL,
    "slide_shift" INTEGER,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worship_timing_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worship_timing_corrections_tenant_id_created_at_idx" ON "worship_timing_corrections"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "worship_timing_corrections_song_id_idx" ON "worship_timing_corrections"("song_id");

-- AddForeignKey
ALTER TABLE "worship_settings" ADD CONSTRAINT "worship_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worship_timing_corrections" ADD CONSTRAINT "worship_timing_corrections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worship_timing_corrections" ADD CONSTRAINT "worship_timing_corrections_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "worship_songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

