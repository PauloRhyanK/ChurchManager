import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import { CreateEventCouponDto } from './dto/create-event-coupon.dto';
import { UpdateEventCouponDto } from './dto/update-event-coupon.dto';
import { EventCouponsService } from './event-coupons.service';

@Controller('admin/tenants/me/events/:eventId/coupons')
@SkipThrottle({ links: true, platform: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.EVENT_TICKETS, PermissionLevel.VIEW)
export class TenantsMeEventCouponsController {
  constructor(private readonly coupons: EventCouponsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return {
      items: await this.coupons.listForEvent(user.tenantId, eventId),
    };
  }

  @Post()
  @RequirePermission(PermissionModule.EVENT_TICKETS, PermissionLevel.EDIT)
  async create(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateEventCouponDto,
  ) {
    return this.coupons.createForEvent(user.tenantId, eventId, dto);
  }

  @Put(':id')
  @RequirePermission(PermissionModule.EVENT_TICKETS, PermissionLevel.EDIT)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventCouponDto,
  ) {
    return this.coupons.updateForEvent(user.tenantId, eventId, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.EVENT_TICKETS, PermissionLevel.EDIT)
  async delete(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.coupons.deleteForEvent(user.tenantId, eventId, id);
  }
}
