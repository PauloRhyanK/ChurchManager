-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- AlterTable
ALTER TABLE "event_orders" ADD COLUMN "coupon_id" UUID,
ADD COLUMN "coupon_code" VARCHAR(32),
ADD COLUMN "discount_cents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "event_coupons" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(255),
    "discount_type" "CouponDiscountType" NOT NULL,
    "discount_value" INTEGER NOT NULL,
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "max_uses_per_cpf" INTEGER NOT NULL DEFAULT 1,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_coupon_ticket_types" (
    "coupon_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,

    CONSTRAINT "event_coupon_ticket_types_pkey" PRIMARY KEY ("coupon_id","ticket_type_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_coupons_tenant_id_event_id_code_key" ON "event_coupons"("tenant_id", "event_id", "code");

-- CreateIndex
CREATE INDEX "event_coupons_tenant_id_idx" ON "event_coupons"("tenant_id");

-- CreateIndex
CREATE INDEX "event_coupons_event_id_idx" ON "event_coupons"("event_id");

-- CreateIndex
CREATE INDEX "event_coupon_ticket_types_ticket_type_id_idx" ON "event_coupon_ticket_types"("ticket_type_id");

-- CreateIndex
CREATE INDEX "event_orders_coupon_id_idx" ON "event_orders"("coupon_id");

-- AddForeignKey
ALTER TABLE "event_coupons" ADD CONSTRAINT "event_coupons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_coupons" ADD CONSTRAINT "event_coupons_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_coupon_ticket_types" ADD CONSTRAINT "event_coupon_ticket_types_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "event_coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_coupon_ticket_types" ADD CONSTRAINT "event_coupon_ticket_types_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "event_ticket_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_orders" ADD CONSTRAINT "event_orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "event_coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
