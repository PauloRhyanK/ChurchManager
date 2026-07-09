import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { CreatePlatformTenantDto } from './dto/create-platform-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller('admin/platform/tenants')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PlatformAdminGuard)
export class PlatformTenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  async list() {
    const items = await this.tenants.listAllTenantsSummary();
    return { items };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ platform: { limit: 10, ttl: 60_000 } })
  async create(@Body() dto: CreatePlatformTenantDto) {
    const { tenant, admin } =
      await this.tenants.createTenantWithInitialAdmin(dto);
    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      admin,
    };
  }
}
