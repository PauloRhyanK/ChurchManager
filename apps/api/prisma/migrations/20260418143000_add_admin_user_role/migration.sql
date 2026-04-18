-- CreateEnum
CREATE TYPE "AdminUserRole" AS ENUM ('TENANT_ADMIN', 'PLATFORM_ADMIN');

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN "role" "AdminUserRole" NOT NULL DEFAULT 'TENANT_ADMIN';
