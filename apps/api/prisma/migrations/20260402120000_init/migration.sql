-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_payer_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cpf" CHAR(11) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "asaas_customer_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_payer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_plans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "interval" VARCHAR(32),
    "asaas_plan_id" VARCHAR(64),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "payer_profile_id" UUID,
    "asaas_customer_id" VARCHAR(64) NOT NULL,
    "asaas_subscription_id" VARCHAR(64),
    "status" VARCHAR(32) NOT NULL,
    "current_period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID,
    "payer_profile_id" UUID,
    "asaas_payment_id" VARCHAR(64),
    "asaas_event_id" VARCHAR(128),
    "type" VARCHAR(64) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "billing_type" VARCHAR(32),
    "raw_payload_ref" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_webhook_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "idempotency_key" VARCHAR(256) NOT NULL,
    "event_type" VARCHAR(128) NOT NULL,
    "payment_id" VARCHAR(64),
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "financial_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "financial_payer_profiles_tenant_id_idx" ON "financial_payer_profiles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_payer_profiles_tenant_id_cpf_key" ON "financial_payer_profiles"("tenant_id", "cpf");

-- CreateIndex
CREATE INDEX "financial_plans_tenant_id_idx" ON "financial_plans"("tenant_id");

-- CreateIndex
CREATE INDEX "financial_subscriptions_tenant_id_idx" ON "financial_subscriptions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_subscriptions_asaas_subscription_id_key" ON "financial_subscriptions"("asaas_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_transactions_asaas_event_id_key" ON "financial_transactions"("asaas_event_id");

-- CreateIndex
CREATE INDEX "financial_transactions_tenant_id_idx" ON "financial_transactions"("tenant_id");

-- CreateIndex
CREATE INDEX "financial_transactions_asaas_payment_id_idx" ON "financial_transactions"("asaas_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_webhook_events_idempotency_key_key" ON "financial_webhook_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "financial_webhook_events_payment_id_idx" ON "financial_webhook_events"("payment_id");

-- AddForeignKey
ALTER TABLE "financial_payer_profiles" ADD CONSTRAINT "financial_payer_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_plans" ADD CONSTRAINT "financial_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_subscriptions" ADD CONSTRAINT "financial_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_subscriptions" ADD CONSTRAINT "financial_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "financial_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_subscriptions" ADD CONSTRAINT "financial_subscriptions_payer_profile_id_fkey" FOREIGN KEY ("payer_profile_id") REFERENCES "financial_payer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "financial_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_payer_profile_id_fkey" FOREIGN KEY ("payer_profile_id") REFERENCES "financial_payer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_webhook_events" ADD CONSTRAINT "financial_webhook_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
