-- AlterEnum
ALTER TYPE "PermissionModule" ADD VALUE 'CHECKIN' AFTER 'EVENT_TICKETS';

-- AlterTable
ALTER TABLE "event_order_lines"
  ADD COLUMN "holder_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "event_tickets"
  ADD COLUMN "checked_in_at" TIMESTAMPTZ,
  ADD COLUMN "checked_in_by_user_id" UUID,
  ADD COLUMN "checked_in_by_name" VARCHAR(255);

-- CreateIndex
CREATE INDEX "event_tickets_tenant_id_checked_in_at_idx" ON "event_tickets"("tenant_id", "checked_in_at");
