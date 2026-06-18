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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';
import { StorageService } from '../storage/storage.service';

@Controller('admin/tenants/me/events')
@UseGuards(AuthGuard('jwt'))
export class TenantsMeEventsController {
  constructor(
    private readonly events: EventsService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.events.listForTenant(user.tenantId) };
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.events.getForTenant(user.tenantId, id);
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.events.createForTenant(user.tenantId, dto);
  }

  @Post('upload-cover')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCover(
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
      `tenants/${user.tenantId}/events/covers`,
    );
    return { url };
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.updateForTenant(user.tenantId, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.events.removeForTenant(user.tenantId, id);
  }
}
