import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, WorshipServiceTemplate } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SermonDeliveryService, type DeliverySummary } from '../sermons/sermon-delivery.service';
import {
  CreateServiceDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  MOMENT_KINDS,
  SetMomentsDto,
  SetSongsDto,
  UpdateServiceDto,
} from './dto/service.dto';
import { RoteiroDraft, placeSongs, songMinutes, songMood } from './roteiro';
import { DEFAULT_TEMPLATE, TemplateMoment, computeSchedule } from './service-schedule';
import type { WorshipRow } from './worship-document';
import { toSongSummary } from './worship-songs.service';

const SERVICE_INCLUDE = {
  moments: { orderBy: { sortOrder: 'asc' }, include: { song: { omit: { rawLyrics: true } } } },
} satisfies Prisma.WorshipServiceInclude;

type ServiceWithAll = Prisma.WorshipServiceGetPayload<{ include: typeof SERVICE_INCLUDE }>;

const toDate = (ymd: string) => {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== ymd) {
    throw new BadRequestException('Data inválida.');
  }
  return date;
};
const ymd = (date: Date) => date.toISOString().slice(0, 10);

/** Os momentos de um modelo salvo, descartando o que não tiver o formato esperado. */
function templateMoments(template: Pick<WorshipServiceTemplate, 'moments'>): TemplateMoment[] {
  if (!Array.isArray(template.moments)) return [];
  return (template.moments as unknown[]).flatMap((raw) => {
    const m = raw as Partial<TemplateMoment> | null;
    if (!m || typeof m.name !== 'string' || typeof m.durationMinutes !== 'number') return [];
    const kind = MOMENT_KINDS.find((k) => k === m.kind) ?? 'GENERIC';
    return [{ name: m.name, kind, durationMinutes: m.durationMinutes }];
  });
}

const rowsOf = (song: { rows: unknown }): WorshipRow[] => (Array.isArray(song.rows) ? (song.rows as WorshipRow[]) : []);

/** Os itens do roteiro com horário: momentos e músicas na mesma ordem. */
export function scheduleOf(service: ServiceWithAll) {
  return computeSchedule(
    service.startTime,
    service.moments.map((m) => ({
      id: m.id,
      // Item de música mostra o título atual da música.
      name: m.song?.title ?? m.name,
      kind: m.kind,
      durationMinutes: m.durationMinutes,
      songId: m.songId,
      songSeconds: m.song?.audioDurationSeconds ?? null,
      song: m.song,
    })),
  );
}

function toServiceResponse(service: ServiceWithAll, sermon: DeliverySummary | null = null) {
  const schedule = scheduleOf(service);
  return {
    id: service.id,
    date: ymd(service.date),
    startTime: service.startTime,
    name: service.name,
    templateId: service.templateId,
    moments: schedule.moments.map(({ song, songSeconds: _seconds, ...m }) => ({
      ...m,
      song: song ? { ...toSongSummary(song), mood: songMood(rowsOf(song)) } : null,
    })),
    endsAt: schedule.endsAt,
    worshipStartsAt: schedule.worshipStartsAt,
    // A aba "Só as músicas": os itens de música do roteiro, na ordem (a mesma música pode entrar duas vezes).
    songs: service.moments.flatMap((m) => (m.song ? [{ entryId: m.id, ...toSongSummary(m.song) }] : [])),
    sermon: sermon
      ? {
          title: sermon.title,
          preacherName: sermon.preacherName,
          estimatedMinutes: sermon.estimatedMinutes,
          slideCount: sermon.slideCount,
        }
      : null,
    updatedAt: service.updatedAt,
  };
}

@Injectable()
export class WorshipServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveries: SermonDeliveryService,
  ) {}

  /** A palavra do culto, lida só da cópia pública (`sermon_deliveries`). */
  private async respond(tenantId: string, service: ServiceWithAll) {
    const sermon = (await this.deliveries.summaries(tenantId, [service.id])).get(service.id) ?? null;
    return toServiceResponse(service, sermon);
  }

  /** Prévia dos slides da palavra do culto, lida só do envio. */
  async sermonSlides(tenantId: string, serviceId: string, viewerUserId: string) {
    const found = await this.deliveries.slidesForService(tenantId, serviceId, viewerUserId);
    if (!found) throw new NotFoundException('Este culto não tem palavra.');
    return {
      title: found.title,
      preacherName: found.preacherName,
      slideStyle: found.slideStyle,
      slides: found.slides,
      mySermonId: found.mySermonId,
    };
  }

  // --- modelos ---------------------------------------------------------------

  async listTemplates(tenantId: string) {
    const saved = await this.prisma.worshipServiceTemplate.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    // O Culto padrão embutido (id null) só existe enquanto a igreja não tem modelo
    // próprio: assim nunca falta um modelo para criar culto, e nada é gravado numa leitura.
    if (saved.length === 0) return { items: [{ id: null, ...DEFAULT_TEMPLATE }] };
    return {
      items: saved.map((t) => ({ id: t.id, name: t.name, startTime: t.startTime, moments: templateMoments(t) })),
    };
  }

  /** Cria um modelo a partir de um culto (`fromServiceId`) ou do zero (`moments`). */
  async createTemplate(tenantId: string, dto: CreateTemplateDto) {
    if (dto.fromServiceId && dto.moments) {
      throw new BadRequestException('Informe o culto de origem ou os momentos do modelo, não os dois.');
    }
    let startTime = dto.startTime ?? DEFAULT_TEMPLATE.startTime;
    let moments: TemplateMoment[];
    if (dto.fromServiceId) {
      const service = await this.find(tenantId, dto.fromServiceId);
      startTime = dto.startTime ?? service.startTime;
      // O modelo guarda o lugar da música, não a música: no próximo culto ela muda.
      moments = service.moments.map((m) =>
        m.kind === 'SONG'
          ? { name: 'Música', kind: 'SONG' as const, durationMinutes: m.durationMinutes }
          : { name: m.name, kind: m.kind, durationMinutes: m.durationMinutes },
      );
    } else if (dto.moments) {
      moments = dto.moments.map((m) => ({ name: m.name, kind: m.kind, durationMinutes: m.durationMinutes }));
    } else {
      throw new BadRequestException('Informe os momentos do modelo ou o culto de origem.');
    }
    const template = await this.prisma.worshipServiceTemplate.create({
      data: { tenantId, name: dto.name, startTime, moments: moments as unknown as Prisma.InputJsonValue },
    });
    return { id: template.id, name: template.name, startTime: template.startTime, moments };
  }

  /** Muda nome, horário e momentos do modelo. Cultos já criados a partir dele não mudam: são cópias. */
  async updateTemplate(tenantId: string, id: string, dto: UpdateTemplateDto) {
    const template = await this.prisma.worshipServiceTemplate.findFirst({ where: { id, tenantId } });
    if (!template) throw new NotFoundException('Modelo não encontrado');
    const data: Prisma.WorshipServiceTemplateUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.startTime !== undefined) data.startTime = dto.startTime;
    if (dto.moments !== undefined) {
      const moments: TemplateMoment[] = dto.moments.map((m) => ({
        name: m.name,
        kind: m.kind,
        durationMinutes: m.durationMinutes,
      }));
      data.moments = moments as unknown as Prisma.InputJsonValue;
    }
    const updated = await this.prisma.worshipServiceTemplate.update({ where: { id: template.id }, data });
    return { id: updated.id, name: updated.name, startTime: updated.startTime, moments: templateMoments(updated) };
  }

  async removeTemplate(tenantId: string, id: string) {
    const template = await this.prisma.worshipServiceTemplate.findFirst({ where: { id, tenantId } });
    if (!template) throw new NotFoundException('Modelo não encontrado');
    await this.prisma.worshipServiceTemplate.delete({ where: { id: template.id } });
    return { success: true };
  }

  // --- cultos ----------------------------------------------------------------

  async list(tenantId: string) {
    const services = await this.prisma.worshipService.findMany({
      where: { tenantId },
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      take: 200,
      include: { _count: { select: { songs: true } } },
    });
    const sermons = await this.deliveries.summaries(tenantId, services.map((s) => s.id));
    return {
      items: services.map((s) => ({
        id: s.id,
        date: ymd(s.date),
        startTime: s.startTime,
        name: s.name,
        songCount: s._count.songs,
        hasSermon: sermons.has(s.id),
      })),
    };
  }

  private async find(tenantId: string, id: string): Promise<ServiceWithAll> {
    const service = await this.prisma.worshipService.findFirst({
      where: { id, tenantId },
      include: SERVICE_INCLUDE,
    });
    if (!service) throw new NotFoundException('Culto não encontrado');
    return service;
  }

  async get(tenantId: string, id: string) {
    return this.respond(tenantId, await this.find(tenantId, id));
  }

  async create(tenantId: string, dto: CreateServiceDto) {
    let template: { id: string | null; name: string; startTime: string; moments: TemplateMoment[] } = {
      id: null,
      ...DEFAULT_TEMPLATE,
    };
    if (dto.templateId) {
      const saved = await this.prisma.worshipServiceTemplate.findFirst({
        where: { id: dto.templateId, tenantId },
      });
      if (!saved) throw new NotFoundException('Modelo não encontrado');
      template = { id: saved.id, name: saved.name, startTime: saved.startTime, moments: templateMoments(saved) };
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.worshipService.create({
        data: {
          tenantId,
          date: toDate(dto.date),
          startTime: dto.startTime ?? template.startTime,
          name: template.name,
          templateId: template.id,
          moments: {
            // Item de música do modelo vira espaço reservado (sem música).
            create: template.moments.map((m, sortOrder) => ({
              name: m.name,
              kind: m.kind,
              durationMinutes: m.durationMinutes,
              sortOrder,
            })),
          },
        },
        include: SERVICE_INCLUDE,
      });
      await this.deliveries.rematch(tx, tenantId, [ymd(row.date)]);
      return row;
    });
    return this.respond(tenantId, created);
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto) {
    const service = await this.find(tenantId, id);
    const data: Prisma.WorshipServiceUpdateInput = {};
    if (dto.date !== undefined) data.date = toDate(dto.date);
    if (dto.startTime !== undefined) data.startTime = dto.startTime;
    if (dto.name !== undefined) data.name = dto.name;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.worshipService.update({
        where: { id: service.id },
        data,
        include: SERVICE_INCLUDE,
      });
      const newDate = dto.date ?? ymd(service.date);
      const newTime = dto.startTime ?? service.startTime;
      if (newDate !== ymd(service.date) || newTime !== service.startTime) {
        await this.deliveries.followService(tx, tenantId, { id: row.id, date: newDate, startTime: newTime });
        await this.deliveries.rematch(tx, tenantId, [ymd(service.date), newDate]);
      }
      return row;
    });
    return this.respond(tenantId, updated);
  }

  async remove(tenantId: string, id: string) {
    const service = await this.find(tenantId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.deliveries.releaseService(tx, tenantId, service.id);
      await tx.worshipService.delete({ where: { id: service.id } });
      await this.deliveries.rematch(tx, tenantId, [ymd(service.date)]);
    });
    return { success: true };
  }

  /** As músicas existem e são desta igreja: devolve título e duração de cada uma. */
  private async songsOf(tenantId: string, ids: string[]) {
    const distinct = [...new Set(ids)];
    const found = distinct.length
      ? await this.prisma.worshipSong.findMany({
          where: { tenantId, id: { in: distinct } },
          select: { id: true, title: true, audioDurationSeconds: true },
        })
      : [];
    if (found.length !== distinct.length) throw new BadRequestException('Música não encontrada no repertório.');
    return new Map(found.map((s) => [s.id, s]));
  }

  /**
   * Grava o roteiro inteiro, na ordem: os momentos (com as músicas como itens)
   * e o espelho das músicas, numa transação só.
   */
  private async writeRoteiro(tenantId: string, service: ServiceWithAll, drafts: RoteiroDraft[]) {
    for (const m of drafts) {
      if (m.kind !== 'SONG' && m.songId) throw new BadRequestException('Só item de música leva música.');
    }
    if (drafts.length > 40) throw new BadRequestException('O roteiro passa de 40 itens.');
    const songs = await this.songsOf(tenantId, drafts.flatMap((m) => (m.songId ? [m.songId] : [])));
    const own = new Set(service.moments.map((m) => m.id));
    const used = new Set<string>();
    const data = drafts.map((m, sortOrder) => {
      // Só reaproveita id que já era deste culto, e uma vez só.
      const keep = m.id && own.has(m.id) && !used.has(m.id) ? m.id : randomUUID();
      used.add(keep);
      const song = m.songId ? songs.get(m.songId) : undefined;
      return {
        id: keep,
        serviceId: service.id,
        name: (song ? song.title : m.name).slice(0, 120),
        kind: m.kind,
        durationMinutes: m.durationMinutes,
        sortOrder,
        songId: m.kind === 'SONG' ? (m.songId ?? null) : null,
      };
    });
    const mirror = data.flatMap((m) => (m.songId ? [m.songId] : [])).map((songId, sortOrder) => ({ serviceId: service.id, songId, sortOrder }));
    await this.prisma.$transaction([
      this.prisma.worshipServiceMoment.deleteMany({ where: { serviceId: service.id } }),
      this.prisma.worshipServiceMoment.createMany({ data }),
      this.prisma.worshipServiceSong.deleteMany({ where: { serviceId: service.id } }),
      this.prisma.worshipServiceSong.createMany({ data: mirror }),
      this.prisma.worshipService.update({ where: { id: service.id }, data: { updatedAt: new Date() } }),
    ]);
    return this.get(tenantId, service.id);
  }

  /** Troca o roteiro inteiro (momentos e músicas), na ordem recebida. */
  async setMoments(tenantId: string, id: string, dto: SetMomentsDto) {
    const service = await this.find(tenantId, id);
    return this.writeRoteiro(
      tenantId,
      service,
      dto.moments.map((m) => ({ id: m.id, name: m.name, kind: m.kind, durationMinutes: m.durationMinutes, songId: m.songId ?? null })),
    );
  }

  /**
   * A aba "Só as músicas": troca a lista de músicas, na ordem recebida, sem
   * mexer nos momentos (ver `placeSongs`).
   */
  async setSongs(tenantId: string, id: string, dto: SetSongsDto) {
    const service = await this.find(tenantId, id);
    const songs = await this.songsOf(tenantId, dto.songIds);
    const current: RoteiroDraft[] = service.moments.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      durationMinutes: m.durationMinutes,
      songId: m.songId,
    }));
    const next = placeSongs(current, dto.songIds, (songId) => {
      const song = songs.get(songId);
      return { name: song?.title ?? 'Música', kind: 'SONG', durationMinutes: songMinutes(song?.audioDurationSeconds), songId };
    });
    return this.writeRoteiro(tenantId, service, next);
  }
}
