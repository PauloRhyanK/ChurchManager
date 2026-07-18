import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import { StorageService } from '../storage/storage.service';
import { UpdateSiteContentDto } from './dto/update-site-content.dto';
import { SITE_ICONS, SITE_SECTIONS } from './site-content.registry';
import { SiteContentService } from './site-content.service';

@Controller('admin/tenants/me/site-content')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.SITE, PermissionLevel.VIEW)
export class TenantsMeSiteContentController {
  constructor(
    private readonly siteContent: SiteContentService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Descreve os campos de cada secção. O painel desenha o formulário a partir
   * daqui, por isso acrescentar um campo ao registry chega para ele aparecer.
   */
  @Get('schema')
  schema() {
    return {
      icons: SITE_ICONS,
      sections: SITE_SECTIONS.map((section) => ({
        key: section.key,
        title: section.title,
        description: section.description,
        icon: section.icon,
        fields: section.fields,
      })),
    };
  }

  /**
   * Upload próprio em vez de reutilizar o dos eventos: quem tem apenas
   * permissão de Site não passa no guard de `EVENTS:EDIT`.
   */
  @Post('upload-image')
  @RequirePermission(PermissionModule.SITE, PermissionLevel.EDIT)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Ficheiro não enviado.');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('O ficheiro deve ser uma imagem.');
    }
    const url = await this.storage.uploadFile(
      file.buffer,
      file.originalname,
      `tenants/${user.tenantId}/site`,
    );
    return { url };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.siteContent.listForTenant(user.tenantId) };
  }

  @Get(':key')
  async get(@CurrentUser() user: AuthUser, @Param('key') key: string) {
    return this.siteContent.getForTenant(user.tenantId, key);
  }

  @Put(':key')
  @RequirePermission(PermissionModule.SITE, PermissionLevel.EDIT)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() dto: UpdateSiteContentDto,
  ) {
    return this.siteContent.updateForTenant(user.tenantId, key, dto.value);
  }

  @Delete(':key')
  @RequirePermission(PermissionModule.SITE, PermissionLevel.EDIT)
  async reset(@CurrentUser() user: AuthUser, @Param('key') key: string) {
    return this.siteContent.resetForTenant(user.tenantId, key);
  }
}
