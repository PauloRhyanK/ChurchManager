import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorshipSong } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateSongDto, ListSongsQueryDto, OrganizeSongDto, UpdateSongDto, UploadAudioDto } from './dto/song.dto';
import { organizeLyrics } from './lyrics-organizer';
import { Pending, WorshipRow, normalizeRows, songStatus } from './worship-document';

const PENDING_LABEL: Record<Pending, string> = {
  AUDIO: 'enviar o áudio',
  TIMES: 'marcar o tempo de todos os slides, em ordem',
  MOODS: 'escolher o clima de todas as partes',
  CONFIRM: 'confirmar',
};

/** Minúsculas e sem acento: a busca por título não diferencia "luz" de "Lúz". */
const plain = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const rowsOf = (song: Pick<WorshipSong, 'rows'>): WorshipRow[] =>
  Array.isArray(song.rows) ? (song.rows as unknown as WorshipRow[]) : [];

const asJson = (rows: WorshipRow[]) => rows as unknown as Prisma.InputJsonValue;

type SongSummarySource = Omit<WorshipSong, 'rawLyrics'>;

/** Resumo para listas (repertório, roteiro, busca). */
export function toSongSummary(song: SongSummarySource) {
  const computed = songStatus(
    rowsOf(song),
    { url: song.audioUrl, durationSeconds: song.audioDurationSeconds },
    song.readyAt,
  );
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    musicalKey: song.musicalKey,
    bpm: song.bpm,
    timeSignature: song.timeSignature,
    status: computed.status,
    pending: computed.pending,
    slideCount: computed.slideCount,
    audio: song.audioUrl
      ? {
          url: song.audioUrl,
          fileName: song.audioFileName,
          durationSeconds: song.audioDurationSeconds,
          sizeBytes: song.audioSizeBytes,
        }
      : null,
    readyAt: song.readyAt,
    updatedAt: song.updatedAt,
  };
}

export function toSongResponse(song: WorshipSong) {
  return { ...toSongSummary(song), rawLyrics: song.rawLyrics, rows: rowsOf(song), createdAt: song.createdAt };
}

@Injectable()
export class WorshipSongsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(tenantId: string, query: ListSongsQueryDto) {
    const songs = await this.prisma.worshipSong.findMany({
      where: { tenantId },
      orderBy: { title: 'asc' },
      omit: { rawLyrics: true },
    });
    const all = songs.map(toSongSummary);
    const ready = all.filter((s) => s.status === 'READY').length;
    const q = plain(query.q ?? '');
    const items = all.filter(
      (s) =>
        (!q || plain(s.title).includes(q)) &&
        (!query.status || (query.status === 'READY') === (s.status === 'READY')),
    );
    return { items, counts: { all: all.length, ready, pending: all.length - ready } };
  }

  private async find(tenantId: string, id: string): Promise<WorshipSong> {
    const song = await this.prisma.worshipSong.findFirst({ where: { id, tenantId } });
    if (!song) throw new NotFoundException('Música não encontrada');
    return song;
  }

  async get(tenantId: string, id: string) {
    return toSongResponse(await this.find(tenantId, id));
  }

  async create(tenantId: string, dto: CreateSongDto) {
    const rawLyrics = dto.rawLyrics ?? '';
    const rows = dto.organize ? normalizeRows(organizeLyrics(rawLyrics)) : [];
    const { status } = songStatus(rows, { url: null, durationSeconds: null }, null);
    const song = await this.prisma.worshipSong.create({
      data: { tenantId, title: dto.title, rawLyrics, rows: asJson(rows), status },
    });
    return toSongResponse(song);
  }

  /**
   * Toda escrita recalcula a situação. Uma música pronta que deixa de estar
   * completa perde o "pronta": só Pronta passa sozinha no culto.
   */
  private computed(song: Pick<WorshipSong, 'audioUrl' | 'audioDurationSeconds' | 'readyAt'>, rows: WorshipRow[]) {
    const { status } = songStatus(rows, { url: song.audioUrl, durationSeconds: song.audioDurationSeconds }, song.readyAt);
    return { status, readyAt: status === 'READY' ? song.readyAt : null };
  }

  async update(tenantId: string, id: string, dto: UpdateSongDto) {
    const song = await this.find(tenantId, id);
    const rows = dto.rows ? normalizeRows(dto.rows as WorshipRow[]) : rowsOf(song);
    const data: Prisma.WorshipSongUpdateInput = { ...this.computed(song, rows) };
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.artist !== undefined) data.artist = dto.artist;
    if (dto.musicalKey !== undefined) data.musicalKey = dto.musicalKey;
    if (dto.bpm !== undefined) data.bpm = dto.bpm;
    if (dto.timeSignature !== undefined) data.timeSignature = dto.timeSignature;
    if (dto.rows) data.rows = asJson(rows);
    return toSongResponse(await this.prisma.worshipSong.update({ where: { id: song.id }, data }));
  }

  /** Refaz a organização a partir da letra colada. Apaga ajustes e tempos. */
  async organize(tenantId: string, id: string, dto: OrganizeSongDto) {
    const song = await this.find(tenantId, id);
    const rawLyrics = dto.rawLyrics ?? song.rawLyrics;
    const rows = normalizeRows(organizeLyrics(rawLyrics));
    const updated = await this.prisma.worshipSong.update({
      where: { id: song.id },
      data: { rawLyrics, rows: asJson(rows), ...this.computed({ ...song, readyAt: null }, rows) },
    });
    return toSongResponse(updated);
  }

  async setAudio(tenantId: string, id: string, file: { buffer?: Buffer; originalname?: string } | undefined, dto: UploadAudioDto) {
    const song = await this.find(tenantId, id);
    const uploaded = await this.storage.uploadAudio(file?.buffer, `tenants/${tenantId}/worship/audio`);
    const audio = {
      audioUrl: uploaded.url,
      audioFileName: (dto.fileName ?? file?.originalname ?? 'audio').slice(0, 255),
      audioDurationSeconds: dto.durationSeconds ?? null,
      audioSizeBytes: uploaded.sizeBytes,
    };
    const updated = await this.prisma.worshipSong.update({
      where: { id: song.id },
      // Os tempos foram marcados contra o arquivo anterior: a música volta a "Falta conferir".
      data: { ...audio, ...this.computed({ ...song, ...audio, readyAt: null }, rowsOf(song)) },
    });
    await this.storage.deleteFileByPublicUrl(song.audioUrl);
    return toSongResponse(updated);
  }

  async removeAudio(tenantId: string, id: string) {
    const song = await this.find(tenantId, id);
    const audio = { audioUrl: null, audioFileName: null, audioDurationSeconds: null, audioSizeBytes: null };
    const updated = await this.prisma.worshipSong.update({
      where: { id: song.id },
      data: { ...audio, ...this.computed({ ...song, ...audio }, rowsOf(song)) },
    });
    await this.storage.deleteFileByPublicUrl(song.audioUrl);
    return toSongResponse(updated);
  }

  async markReady(tenantId: string, id: string) {
    const song = await this.find(tenantId, id);
    const rows = rowsOf(song);
    const current = songStatus(rows, { url: song.audioUrl, durationSeconds: song.audioDurationSeconds }, null);
    if (current.status === 'DRAFT') {
      throw new BadRequestException('A música ainda não tem a letra organizada.');
    }
    const missing = current.pending.filter((p) => p !== 'CONFIRM');
    if (missing.length) {
      throw new BadRequestException(`Ainda falta: ${missing.map((p) => PENDING_LABEL[p]).join('; ')}.`);
    }
    const updated = await this.prisma.worshipSong.update({
      where: { id: song.id },
      data: { status: 'READY', readyAt: new Date() },
    });
    return toSongResponse(updated);
  }

  async unmarkReady(tenantId: string, id: string) {
    const song = await this.find(tenantId, id);
    const updated = await this.prisma.worshipSong.update({
      where: { id: song.id },
      data: this.computed({ ...song, readyAt: null }, rowsOf(song)),
    });
    return toSongResponse(updated);
  }

  async remove(tenantId: string, id: string) {
    const song = await this.find(tenantId, id);
    const inServices = await this.prisma.worshipServiceSong.count({ where: { songId: song.id } });
    if (inServices > 0) {
      throw new ConflictException('Esta música está em um roteiro. Tire-a do roteiro antes de apagar.');
    }
    await this.prisma.worshipSong.delete({ where: { id: song.id } });
    await this.storage.deleteFileByPublicUrl(song.audioUrl);
    return { success: true };
  }
}
