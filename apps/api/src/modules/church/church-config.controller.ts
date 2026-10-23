import {
  Body,
  Controller,
  Get,
  Put,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ImageUploadInterceptor } from '../storage/image-upload.interceptor';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import { StorageService } from '../storage/storage.service';
import { UpdateChurchConfigDto } from './dto/update-church-config.dto';
import { ChurchConfigService } from './church-config.service';

@Controller('admin/tenants/me/church-config')
@SkipThrottle({ links: true, platform: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.CHURCH, PermissionLevel.VIEW)
export class ChurchConfigController {
  constructor(
    private readonly configService: ChurchConfigService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    return this.configService.getForTenant(user.tenantId);
  }

  @Put()
  @RequirePermission(PermissionModule.CHURCH, PermissionLevel.EDIT)
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateChurchConfigDto) {
    return this.configService.updateForTenant(user.tenantId, dto);
  }

  @Post('upload-image')
  @RequirePermission(PermissionModule.CHURCH, PermissionLevel.EDIT)
  @UseInterceptors(ImageUploadInterceptor)
  async uploadImage(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const url = await this.storage.uploadImage(
      file?.buffer,
      `tenants/${user.tenantId}/church`,
    );
    return { url };
  }
}
