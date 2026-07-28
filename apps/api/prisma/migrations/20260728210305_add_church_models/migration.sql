/*
  Warnings:

  - You are about to alter the column `title` on the `events` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.

*/
-- AlterEnum
ALTER TYPE "PermissionModule" ADD VALUE 'CHURCH';

-- AlterTable
ALTER TABLE "event_field_definitions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event_order_lines" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "holder_names" DROP DEFAULT;

-- AlterTable
ALTER TABLE "event_orders" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "confirmed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event_registrations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event_tags" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event_ticket_types" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "sales_opens_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "sales_closes_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "allowed_billing_types" DROP DEFAULT;

-- AlterTable
ALTER TABLE "event_tickets" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "checked_in_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "events" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "title" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "registration_closes_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "schedules" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "site_content" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tenant_public_web_origins" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "church_branches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "location" VARCHAR(255),
    "address" TEXT,
    "image" VARCHAR(512),
    "mapsUrl" VARCHAR(2048),
    "is_headquarters" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "church_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "image" VARCHAR(512),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pastors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ministries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(64),
    "image" VARCHAR(512),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ministries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "church_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pix_key" VARCHAR(160),
    "bank_name" VARCHAR(80),
    "bank_code" VARCHAR(10),
    "agency" VARCHAR(20),
    "account" VARCHAR(30),
    "holder_name" VARCHAR(160),
    "holder_document" VARCHAR(30),
    "youtube_url" VARCHAR(512),
    "instagram_url" VARCHAR(512),
    "facebook_url" VARCHAR(512),
    "phone" VARCHAR(40),
    "email" VARCHAR(160),
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "church_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "church_branches_tenant_id_idx" ON "church_branches"("tenant_id");

-- CreateIndex
CREATE INDEX "pastors_tenant_id_idx" ON "pastors"("tenant_id");

-- CreateIndex
CREATE INDEX "ministries_tenant_id_idx" ON "ministries"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "church_configs_tenant_id_key" ON "church_configs"("tenant_id");

-- AddForeignKey
ALTER TABLE "church_branches" ADD CONSTRAINT "church_branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastors" ADD CONSTRAINT "pastors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ministries" ADD CONSTRAINT "ministries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "church_configs" ADD CONSTRAINT "church_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
