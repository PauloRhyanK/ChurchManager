import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('health')
@SkipThrottle()
export class HealthController {
  @Get()
  getHealth() {
    return { ok: true, service: 'church-manager-api' };
  }
}
