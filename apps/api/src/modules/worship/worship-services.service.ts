import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, WorshipServiceMoment, WorshipServiceTemplate } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateServiceDto,
  CreateTemplateDto,
  MOMENT_KINDS,
  SetMomentsDto,
  SetSongsDto,
  UpdateServiceDto,
} from './dto/service.dto';
import { DEFAULT_TEMPLATE, TemplateMoment, computeSchedule } from './service-schedule';
import { toSongSummary } from './worship-songs.service';

const SERVICE_INCLUDE = {
  moments: { orderBy: { sortOrder: 'asc' } },
  songs: { orderBy: { sortOrder: 'asc' }, include: { song: { omit: { rawLyrics: true } } } },
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

function toServiceResponse(service: ServiceWithAll) {
  const schedule = computeSchedule(
    service.startTime,
    service.moments.map((m: WorshipServiceMoment) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      durationMinutes: m.durationMinutes,
    })),
    service.songs.map((s) => s.song.audioDurationSeconds),
  );
  return {
    id: service.id,
    date: ymd(service.date),
    startTime: service.startTime,
    name: service.name,
    templateId: service.templateId,
    moments: schedule.moments,
    endsAt: schedule.endsAt,
    worshipStartsAt: schedule.worshipStartsAt,
    songs: service.songs.map((s) => ({ entryId: s.id, ...toSongSummary(s.song) })),
    updatedAt: service.updatedAt,
  };
}

@Injectable()
export class WorshipServicesService {
  constructor(private readonly prisma: PrismaService) {}

  // --- modelos ---------------------------------------------------------------

  async listTemplates(tenantId: string) {
    const saved = await this.prisma.worshipServiceTemplate.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return {
      items: [
        { id: null, ...DEFAULT_TEMPLATE },
        ...saved.map((t) => ({ id: t.id, name: t.name, startTime: t.startTime, moments: templateMoments(t) })),
      ],
    };
  }

  async createTemplate(tenantId: string, dto: CreateTemplateDto) {
    const service = await this.find(tenantId, dto.fromServiceId);
    const moments: TemplateMoment[] = service.moments.map((m) => ({
      name: m.name,
      kind: m.kind,
      durationMinutes: m.durationMinutes,
    }));
    const template = await this.prisma.worshipServiceTemplate.create({
      data: {
        tenantId,
        name: dto.name,
        startTime: service.startTime,
        moments: moments as unknown as Prisma.InputJsonValue,
      },
    });
    return { id: template.id, name: template.name, startTime: template.startTime, moments };
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
    return {
      items: services.map((s) => ({
        id: s.id,
        date: ymd(s.date),
        startTime: s.startTime,
        name: s.name,
        songCount: s._count.songs,
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
    return toServiceResponse(await this.find(tenantId, id));
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
    const created = await this.prisma.worshipService.create({
      data: {
        tenantId,
        date: toDate(dto.date),
        startTime: dto.startTime ?? template.startTime,
        name: template.name,
        templateId: template.id,
        moments: {
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
    return toServiceResponse(created);
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto) {
    const service = await this.find(tenantId, id);
    const data: Prisma.WorshipServiceUpdateInput = {};
    if (dto.date !== undefined) data.date = toDate(dto.date);
    if (dto.startTime !== undefined) data.startTime = dto.startTime;
    if (dto.name !== undefined) data.name = dto.name;
    const updated = await this.prisma.worshipService.update({
      where: { id: service.id },
      data,
      include: SERVICE_INCLUDE,
    });
    return toServiceResponse(updated);
  }

  async remove(tenantId: string, id: string) {
    const service = await this.find(tenantId, id);
    await this.prisma.worshipService.delete({ where: { id: service.id } });
    return { success: true };
  }

  /** Troca a lista inteira de momentos, na ordem recebida. */
  async setMoments(tenantId: string, id: string, dto: SetMomentsDto) {
    const service = await this.find(tenantId, id);
    const own = new Set(service.moments.map((m) => m.id));
    const used = new Set<string>();
    const data = dto.moments.map((m, sortOrder) => {
      // Só reaproveita id que já era deste culto, e uma vez só.
      const keep = m.id && own.has(m.id) && !used.has(m.id) ? m.id : randomUUID();
      used.add(keep);
      return { id: keep, serviceId: service.id, name: m.name, kind: m.kind, durationMinutes: m.durationMinutes, sortOrder };
    });
    await this.prisma.$transaction([
      this.prisma.worshipServiceMoment.deleteMany({ where: { serviceId: service.id } }),
      this.prisma.worshipServiceMoment.createMany({ data }),
      this.prisma.worshipService.update({ where: { id: service.id }, data: { updatedAt: new Date() } }),
    ]);
    return this.get(tenantId, id);
  }

  /** Troca a lista inteira de músicas do culto, na ordem recebida. */
  async setSongs(tenantId: string, id: string, dto: SetSongsDto) {
    const service = await this.find(tenantId, id);
    const distinct = [...new Set(dto.songIds)];
    const found = await this.prisma.worshipSong.count({ where: { tenantId, id: { in: distinct } } });
    if (found !== distinct.length) {
      throw new BadRequestException('Música não encontrada no repertório.');
    }
    await this.prisma.$transaction([
      this.prisma.worshipServiceSong.deleteMany({ where: { serviceId: service.id } }),
      this.prisma.worshipServiceSong.createMany({
        data: dto.songIds.map((songId, sortOrder) => ({ serviceId: service.id, songId, sortOrder })),
      }),
      this.prisma.worshipService.update({ where: { id: service.id }, data: { updatedAt: new Date() } }),
    ]);
    return this.get(tenantId, id);
  }
}
