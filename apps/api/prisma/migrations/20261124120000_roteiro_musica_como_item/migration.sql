-- AlterEnum
ALTER TYPE "WorshipMomentKind" ADD VALUE 'SONG';

-- AlterTable
ALTER TABLE "worship_service_moments" ADD COLUMN     "song_id" UUID;

-- CreateIndex
CREATE INDEX "worship_service_moments_song_id_idx" ON "worship_service_moments"("song_id");

-- AddForeignKey
ALTER TABLE "worship_service_moments" ADD CONSTRAINT "worship_service_moments_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "worship_songs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

