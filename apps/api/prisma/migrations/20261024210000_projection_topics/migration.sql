-- AlterTable
ALTER TABLE "projection_settings" ADD COLUMN     "topics" JSONB NOT NULL DEFAULT '[]';
