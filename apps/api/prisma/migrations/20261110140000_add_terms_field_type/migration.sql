-- AlterEnum
ALTER TYPE "EventFieldType" ADD VALUE 'TERMS';

-- AlterTable
ALTER TABLE "event_field_definitions" ADD COLUMN "term_text" TEXT;
