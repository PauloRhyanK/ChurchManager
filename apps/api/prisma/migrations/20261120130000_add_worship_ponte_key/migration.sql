-- AlterTable
ALTER TABLE "worship_songs" ADD COLUMN     "holyrics_id" VARCHAR(64);

-- CreateTable
CREATE TABLE "worship_ponte_keys" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "key_hint" VARCHAR(8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "worship_ponte_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worship_ponte_keys_tenant_id_key" ON "worship_ponte_keys"("tenant_id");

-- AddForeignKey
ALTER TABLE "worship_ponte_keys" ADD CONSTRAINT "worship_ponte_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

