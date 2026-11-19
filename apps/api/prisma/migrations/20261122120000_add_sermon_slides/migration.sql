-- CreateEnum
CREATE TYPE "SermonSlideMode" AS ENUM ('VERSES', 'VERSES_AND_POINTS', 'FULL');

-- CreateEnum
CREATE TYPE "SermonSlideStyle" AS ENUM ('MINIMAL', 'BACKGROUND');

-- AlterTable
ALTER TABLE "sermon_deliveries" ADD COLUMN     "slide_style" "SermonSlideStyle" NOT NULL DEFAULT 'MINIMAL',
ADD COLUMN     "slides" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "sermons" ADD COLUMN     "slide_mode" "SermonSlideMode",
ADD COLUMN     "slide_style" "SermonSlideStyle" NOT NULL DEFAULT 'MINIMAL',
ADD COLUMN     "slides" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "slides_revision" INTEGER;
