import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaHealthProbe } from './health.probe';

@Module({
  controllers: [HealthController],
  providers: [PrismaHealthProbe],
})
export class HealthModule {}
