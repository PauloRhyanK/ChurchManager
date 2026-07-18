-- CreateTable
CREATE TABLE "site_content" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_content_tenant_id_idx" ON "site_content"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_content_tenant_id_key_key" ON "site_content"("tenant_id", "key");

-- AddForeignKey
ALTER TABLE "site_content" ADD CONSTRAINT "site_content_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
