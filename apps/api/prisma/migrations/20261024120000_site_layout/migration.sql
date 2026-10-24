-- CreateTable
CREATE TABLE "site_layout" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "home_order" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "site_layout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_layout_tenant_id_key" ON "site_layout"("tenant_id");

-- AddForeignKey
ALTER TABLE "site_layout" ADD CONSTRAINT "site_layout_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
