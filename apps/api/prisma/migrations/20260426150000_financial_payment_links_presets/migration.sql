-- CreateEnum
CREATE TYPE "FinancialLinkModule" AS ENUM ('COTAS', 'EVENTS');

-- CreateEnum
CREATE TYPE "FinancialPaymentLinkMode" AS ENUM ('PRESET_GLOBAL', 'CPF_CUSTOM', 'EVENT_AUTO');

-- CreateTable
CREATE TABLE "financial_link_presets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "module" "FinancialLinkModule" NOT NULL,
    "preset_key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "source_key" VARCHAR(120) NOT NULL,
    "is_monthly" BOOLEAN NOT NULL,
    "subscription_duration_months" INTEGER,
    "value_cents" INTEGER,
    "success_url" VARCHAR(2048),
    "auto_redirect" BOOLEAN,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_link_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_payment_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "preset_id" UUID,
    "provider" VARCHAR(32) NOT NULL DEFAULT 'asaas',
    "provider_link_id" VARCHAR(80) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "module" "FinancialLinkModule" NOT NULL,
    "source_key" VARCHAR(120) NOT NULL,
    "mode" "FinancialPaymentLinkMode" NOT NULL,
    "reuse_key" VARCHAR(255) NOT NULL,
    "cpf" CHAR(11),
    "payer_name" VARCHAR(255),
    "is_monthly" BOOLEAN NOT NULL,
    "subscription_duration_months" INTEGER,
    "value_cents" INTEGER,
    "success_url" VARCHAR(2048),
    "auto_redirect" BOOLEAN,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_link_presets_tenant_id_module_preset_key_key" ON "financial_link_presets"("tenant_id", "module", "preset_key");

-- CreateIndex
CREATE INDEX "financial_link_presets_tenant_id_module_active_idx" ON "financial_link_presets"("tenant_id", "module", "active");

-- CreateIndex
CREATE UNIQUE INDEX "financial_payment_links_tenant_id_reuse_key_key" ON "financial_payment_links"("tenant_id", "reuse_key");

-- CreateIndex
CREATE UNIQUE INDEX "financial_payment_links_tenant_id_provider_link_id_key" ON "financial_payment_links"("tenant_id", "provider_link_id");

-- CreateIndex
CREATE INDEX "financial_payment_links_tenant_id_module_mode_active_idx" ON "financial_payment_links"("tenant_id", "module", "mode", "active");

-- CreateIndex
CREATE INDEX "financial_payment_links_tenant_id_cpf_idx" ON "financial_payment_links"("tenant_id", "cpf");

-- AddForeignKey
ALTER TABLE "financial_link_presets" ADD CONSTRAINT "financial_link_presets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_payment_links" ADD CONSTRAINT "financial_payment_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_payment_links" ADD CONSTRAINT "financial_payment_links_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "financial_link_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
