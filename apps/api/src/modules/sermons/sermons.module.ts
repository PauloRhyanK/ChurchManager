import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { BibleController } from './bible/bible.controller';
import { BIBLE_SOURCE, BibleService, PrismaBibleSource } from './bible/bible.service';
import { SermonDeliveryService } from './sermon-delivery.service';
import { SermonsController } from './sermons.controller';
import { SermonsService } from './sermons.service';

/** Palavras: biblioteca privada de pregações de cada pregador. */
@Module({
  imports: [AuthModule, AccessModule],
  // BibleController antes de SermonsController: 'bible' não pode cair em ':id'.
  controllers: [BibleController, SermonsController],
  providers: [SermonsService, SermonDeliveryService, BibleService, { provide: BIBLE_SOURCE, useClass: PrismaBibleSource }],
  exports: [SermonsService, SermonDeliveryService],
})
export class SermonsModule {}
