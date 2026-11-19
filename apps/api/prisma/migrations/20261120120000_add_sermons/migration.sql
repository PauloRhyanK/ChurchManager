-- AlterEnum
ALTER TYPE "PermissionModule" ADD VALUE 'SERMONS';

-- AlterEnum
ALTER TYPE "WorshipMomentKind" ADD VALUE 'SERMON';

-- CreateTable
CREATE TABLE "sermons" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL DEFAULT 'Sem título',
    "document" JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "base_reference" VARCHAR(120),
    "point_count" INTEGER NOT NULL DEFAULT 0,
    "verse_refs" TEXT NOT NULL DEFAULT '',
    "estimated_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sermons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermon_deliveries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sermon_id" UUID,
    "author_id" UUID,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "service_id" UUID,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "title" VARCHAR(255) NOT NULL,
    "preacher_name" VARCHAR(255) NOT NULL,
    "estimated_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sermon_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sermons_tenant_id_author_id_updated_at_idx" ON "sermons"("tenant_id", "author_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "sermon_deliveries_sermon_id_key" ON "sermon_deliveries"("sermon_id");

-- CreateIndex
CREATE UNIQUE INDEX "sermon_deliveries_service_id_key" ON "sermon_deliveries"("service_id");

-- CreateIndex
CREATE INDEX "sermon_deliveries_tenant_id_date_idx" ON "sermon_deliveries"("tenant_id", "date");

-- AddForeignKey
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermon_deliveries" ADD CONSTRAINT "sermon_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermon_deliveries" ADD CONSTRAINT "sermon_deliveries_sermon_id_fkey" FOREIGN KEY ("sermon_id") REFERENCES "sermons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermon_deliveries" ADD CONSTRAINT "sermon_deliveries_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermon_deliveries" ADD CONSTRAINT "sermon_deliveries_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "worship_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

