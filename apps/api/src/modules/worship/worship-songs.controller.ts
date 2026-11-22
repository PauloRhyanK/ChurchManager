import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { AudioUploadInterceptor } from '../storage/audio-upload.interceptor';
import { CreateSongDto, ListSongsQueryDto, OrganizeSongDto, UpdateSongDto, UploadAudioDto } from './dto/song.dto';
import { ImportYoutubeDto, SearchYoutubeQueryDto } from './dto/youtube.dto';
import { WorshipSongsService } from './worship-songs.service';
import { WorshipYoutubeService } from './worship-youtube.service';

/** Cultos › Músicas: o repertório e a montagem de cada música. */
@Controller('admin/tenants/me/worship/songs')
@SkipThrottle({ links: true, platform: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.WORSHIP, PermissionLevel.VIEW)
export class WorshipSongsController {
  constructor(
    private readonly songs: WorshipSongsService,
    private readonly youtube: WorshipYoutubeService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListSongsQueryDto) {
    return this.songs.list(user.tenantId, query);
  }

  @Get('youtube/search')
  searchYoutube(@Query() query: SearchYoutubeQueryDto) {
    return this.youtube.search(query.q);
  }

  @Post('youtube/import')
  @HttpCode(200)
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  importYoutube(@CurrentUser() user: AuthUser, @Body() dto: ImportYoutubeDto) {
    return this.youtube.import(user.tenantId, dto.urlOrId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.songs.get(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSongDto) {
    return this.songs.create(user.tenantId, dto);
  }

  @Put(':id')
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSongDto) {
    return this.songs.update(user.tenantId, id, dto);
  }

  @Post(':id/organize')
  @HttpCode(200)
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  organize(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OrganizeSongDto) {
    return this.songs.organize(user.tenantId, id, dto);
  }

  @Post(':id/audio')
  @HttpCode(200)
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  @UseInterceptors(AudioUploadInterceptor)
  uploadAudio(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadAudioDto,
  ) {
    return this.songs.setAudio(user.tenantId, id, file, dto);
  }

  @Post(':id/youtube')
  @HttpCode(200)
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  setYoutubeAudio(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportYoutubeDto,
  ) {
    return this.songs.setYoutubeAudio(user.tenantId, id, dto.urlOrId);
  }

  @Delete(':id/audio')
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  removeAudio(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.songs.removeAudio(user.tenantId, id);
  }

  @Post(':id/ready')
  @HttpCode(200)
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  markReady(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.songs.markReady(user.tenantId, id);
  }

  @Delete(':id/ready')
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  unmarkReady(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.songs.unmarkReady(user.tenantId, id);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.songs.remove(user.tenantId, id);
  }
}
