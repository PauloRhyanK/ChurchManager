import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { SermonsController } from './sermons.controller';
import { SermonsService } from './sermons.service';

/** Palavras: biblioteca privada de pregações de cada pregador. */
@Module({
  imports: [AuthModule, AccessModule],
  controllers: [SermonsController],
  providers: [SermonsService],
  exports: [SermonsService],
})
export class SermonsModule {}
