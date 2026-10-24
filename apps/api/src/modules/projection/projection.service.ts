import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_EVENT_TIMEZONE,
  startOfTodayInTimeZone,
} from '../events/event-format.util';
import { SiteRevalidationService } from '../site/site-revalidation.service';
import { UpdateProjectionSettingsDto } from './dto/update-projection-settings.dto';
import {
  PROJECTION_DAYS,
  buildProjectionAgenda,
  type ProjectionAgendaItem,
} from './projection-agenda';

export interface ProjectionAgendaDto {
  items: ProjectionAgendaItem[];
  days: number;
  /** null enquanto nada foi ocultado (configuração nunca salva). */
  updatedAt: string | null;
}

@Injectable()
export class ProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteRevalidation: SiteRevalidationService,
  ) {}

  /** Agenda com os ocultos marcados (prévia do painel). */
  async getAgendaForTenant(tenantId: string, now = new Date()): Promise<ProjectionAgendaDto> {
    const today = startOfTodayInTimeZone(DEFAULT_EVENT_TIMEZONE, now);
    const [schedules, events, settings] = await Promise.all([
      this.prisma.schedule.findMany({ where: { tenantId, active: true } }),
      this.prisma.event.findMany({
        where: { tenantId, published: true, date: { gte: today } },
      }),
      this.prisma.projectionSettings.findUnique({ where: { tenantId } }),
    ]);
    return {
      items: buildProjectionAgenda({
        today,
        schedules,
        events,
        hiddenEventIds: settings?.hiddenEventIds ?? [],
        hiddenScheduleIds: settings?.hiddenScheduleIds ?? [],
      }),
      days: PROJECTION_DAYS,
      updatedAt: settings?.updatedAt.toISOString() ?? null,
    };
  }

  /** O que vai para o telão: só os visíveis, sem o campo `hidden`. */
  async getPublicAgenda(tenantId: string, now = new Date()) {
    const { items } = await this.getAgendaForTenant(tenantId, now);
    return {
      items: items
        .filter((item) => !item.hidden)
        .map(({ hidden: _hidden, ...item }) => item),
    };
  }

  async updateSettingsForTenant(
    tenantId: string,
    dto: UpdateProjectionSettingsDto,
    now = new Date(),
  ): Promise<ProjectionAgendaDto> {
    // Só ids do próprio tenant, sem repetidos: o resto é descartado em silêncio.
    const [events, schedules] = await Promise.all([
      this.prisma.event.findMany({
        where: { tenantId, id: { in: [...new Set(dto.hiddenEventIds)] } },
        select: { id: true },
      }),
      this.prisma.schedule.findMany({
        where: { tenantId, id: { in: [...new Set(dto.hiddenScheduleIds)] } },
        select: { id: true },
      }),
    ]);
    const data = {
      hiddenEventIds: events.map((row) => row.id),
      hiddenScheduleIds: schedules.map((row) => row.id),
    };
    await this.prisma.projectionSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });

    this.siteRevalidation.notifyContentChanged(tenantId);

    return this.getAgendaForTenant(tenantId, now);
  }
}
