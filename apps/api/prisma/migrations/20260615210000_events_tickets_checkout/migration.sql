-- M2: tipos de ingresso, pedidos, bilhetes e ligação a transacções financeiras

CREATE TYPE "EventOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "EventTicketStatus" AS ENUM ('VALID', 'CANCELLED', 'REFUNDED', 'USED');

ALTER TABLE "events"
  ADD COLUMN "slug" VARCHAR(120),
  ADD COLUMN "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN "registration_closes_at" TIMESTAMPTZ,
  ADD COLUMN "terms_url" VARCHAR(2048),
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL';

CREATE UNIQUE INDEX "events_tenant_id_slug_key" ON "events"("tenant_id", "slug");

CREATE TABLE "event_ticket_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "fee_cents" INTEGER NOT NULL DEFAULT 0,
    "quantity_total" INTEGER,
    "quantity_sold" INTEGER NOT NULL DEFAULT 0,
    "min_per_order" INTEGER NOT NULL DEFAULT 1,
    "max_per_order" INTEGER NOT NULL DEFAULT 10,
    "sales_opens_at" TIMESTAMPTZ,
    "sales_closes_at" TIMESTAMPTZ,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_ticket_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "payer_profile_id" UUID,
    "status" "EventOrderStatus" NOT NULL DEFAULT 'PENDING',
    "total_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "idempotency_key" VARCHAR(128),
    "confirmed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_order_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    CONSTRAINT "event_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "public_code" VARCHAR(32) NOT NULL,
    "holder_name" VARCHAR(255) NOT NULL,
    "status" "EventTicketStatus" NOT NULL DEFAULT 'VALID',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financial_transactions"
  ADD COLUMN "event_order_id" UUID;

ALTER TABLE "event_ticket_types"
  ADD CONSTRAINT "event_ticket_types_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_ticket_types"
  ADD CONSTRAINT "event_ticket_types_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_orders"
  ADD CONSTRAINT "event_orders_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_orders"
  ADD CONSTRAINT "event_orders_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_orders"
  ADD CONSTRAINT "event_orders_payer_profile_id_fkey"
  FOREIGN KEY ("payer_profile_id") REFERENCES "financial_payer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_order_lines"
  ADD CONSTRAINT "event_order_lines_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "event_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_order_lines"
  ADD CONSTRAINT "event_order_lines_ticket_type_id_fkey"
  FOREIGN KEY ("ticket_type_id") REFERENCES "event_ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_tickets"
  ADD CONSTRAINT "event_tickets_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_tickets"
  ADD CONSTRAINT "event_tickets_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "event_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_tickets"
  ADD CONSTRAINT "event_tickets_ticket_type_id_fkey"
  FOREIGN KEY ("ticket_type_id") REFERENCES "event_ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "financial_transactions"
  ADD CONSTRAINT "financial_transactions_event_order_id_fkey"
  FOREIGN KEY ("event_order_id") REFERENCES "event_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "event_orders_idempotency_key_key" ON "event_orders"("idempotency_key");
CREATE UNIQUE INDEX "event_order_lines_order_id_ticket_type_id_key" ON "event_order_lines"("order_id", "ticket_type_id");
CREATE UNIQUE INDEX "event_tickets_public_code_key" ON "event_tickets"("public_code");

CREATE INDEX "event_ticket_types_tenant_id_idx" ON "event_ticket_types"("tenant_id");
CREATE INDEX "event_ticket_types_event_id_idx" ON "event_ticket_types"("event_id");
CREATE INDEX "event_orders_tenant_id_idx" ON "event_orders"("tenant_id");
CREATE INDEX "event_orders_event_id_idx" ON "event_orders"("event_id");
CREATE INDEX "event_orders_tenant_id_status_idx" ON "event_orders"("tenant_id", "status");
CREATE INDEX "event_tickets_tenant_id_idx" ON "event_tickets"("tenant_id");
CREATE INDEX "event_tickets_order_id_idx" ON "event_tickets"("order_id");
CREATE INDEX "financial_transactions_event_order_id_idx" ON "financial_transactions"("event_order_id");
