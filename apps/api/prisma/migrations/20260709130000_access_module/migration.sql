-- AlterEnum
ALTER TYPE "AdminUserRole" ADD VALUE 'TENANT_MEMBER';

-- CreateEnum
CREATE TYPE "AdminUserStatus" AS ENUM ('ACTIVE', 'PENDING_APPROVAL', 'INVITED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PermissionModule" AS ENUM ('DASHBOARD', 'EVENTS', 'EVENT_REGISTRATIONS', 'EVENT_TICKETS', 'FINANCIAL', 'SITE', 'SETTINGS', 'USERS');

-- CreateEnum
CREATE TYPE "PermissionLevel" AS ENUM ('VIEW', 'EDIT');

-- AlterTable
ALTER TABLE "admin_users"
  ADD COLUMN "name" VARCHAR(255),
  ADD COLUMN "status" "AdminUserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "approved_by_id" UUID;

-- AlterTable
ALTER TABLE "admin_users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "permission_groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_group_entries" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "module" "PermissionModule" NOT NULL,
    "level" "PermissionLevel" NOT NULL,

    CONSTRAINT "permission_group_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user_permission_groups" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,

    CONSTRAINT "admin_user_permission_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_signup_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "label" VARCHAR(255),
    "default_group_ids" JSONB,
    "expires_at" TIMESTAMP(3),
    "max_uses" INTEGER,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_signup_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user_invitations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "user_id" UUID,
    "group_ids" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "invited_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_users_tenant_id_status_idx" ON "admin_users"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "permission_groups_tenant_id_idx" ON "permission_groups"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "permission_groups_tenant_id_name_key" ON "permission_groups"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "permission_group_entries_group_id_idx" ON "permission_group_entries"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "permission_group_entries_group_id_module_key" ON "permission_group_entries"("group_id", "module");

-- CreateIndex
CREATE INDEX "admin_user_permission_groups_user_id_idx" ON "admin_user_permission_groups"("user_id");

-- CreateIndex
CREATE INDEX "admin_user_permission_groups_group_id_idx" ON "admin_user_permission_groups"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_permission_groups_user_id_group_id_key" ON "admin_user_permission_groups"("user_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_signup_links_token_key" ON "tenant_signup_links"("token");

-- CreateIndex
CREATE INDEX "tenant_signup_links_tenant_id_idx" ON "tenant_signup_links"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_invitations_token_key" ON "admin_user_invitations"("token");

-- CreateIndex
CREATE INDEX "admin_user_invitations_tenant_id_idx" ON "admin_user_invitations"("tenant_id");

-- CreateIndex
CREATE INDEX "admin_user_invitations_email_idx" ON "admin_user_invitations"("email");

-- AddForeignKey
ALTER TABLE "permission_groups" ADD CONSTRAINT "permission_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_group_entries" ADD CONSTRAINT "permission_group_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "permission_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_permission_groups" ADD CONSTRAINT "admin_user_permission_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_permission_groups" ADD CONSTRAINT "admin_user_permission_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "permission_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_signup_links" ADD CONSTRAINT "tenant_signup_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_invitations" ADD CONSTRAINT "admin_user_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_invitations" ADD CONSTRAINT "admin_user_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
