-- CreateTable
CREATE TABLE "projection_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "hidden_event_ids" TEXT[],
    "hidden_schedule_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projection_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projection_settings_tenant_id_key" ON "projection_settings"("tenant_id");

-- AddForeignKey
ALTER TABLE "projection_settings" ADD CONSTRAINT "projection_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

