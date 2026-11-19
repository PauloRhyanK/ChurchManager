import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { SermonsModule } from '../sermons/sermons.module';
import { WorshipServicesController, WorshipTemplatesController } from './worship-services.controller';
import { WorshipServicesService } from './worship-services.service';
import { WorshipSongsController } from './worship-songs.controller';
import { WorshipSongsService } from './worship-songs.service';

/** Cultos: músicas (letra, tempo, clima, áudio-guia) e roteiro. */
@Module({
  imports: [AuthModule, AccessModule, SermonsModule],
  controllers: [WorshipSongsController, WorshipServicesController, WorshipTemplatesController],
  providers: [WorshipSongsService, WorshipServicesService],
})
export class WorshipModule {}
