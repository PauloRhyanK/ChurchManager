import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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
  readTopics,
  type ProjectionAgendaItem,
  type ProjectionTopic,
} from './projection-agenda';

export interface ProjectionAgendaDto {
  items: ProjectionAgendaItem[];
  /** Todos os tópicos fixos, ativos ou não, na ordem da tela. */
  topics: ProjectionTopic[];
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
      topics: readTopics(settings?.topics),
      days: PROJECTION_DAYS,
      updatedAt: settings?.updatedAt.toISOString() ?? null,
    };
  }

  /** O que vai para o telão: só os visíveis, sem o campo `hidden`. */
  async getPublicAgenda(tenantId: string, now = new Date()) {
    const { items, topics } = await this.getAgendaForTenant(tenantId, now);
    return {
      items: items
        .filter((item) => !item.hidden)
        .map(({ hidden: _hidden, ...item }) => item),
      topics: topics
        .filter((topic) => topic.active)
        .map(({ active: _active, ...topic }) => topic),
    };
  }

  async updateSettingsForTenant(
    tenantId: string,
    dto: UpdateProjectionSettingsDto,
    now = new Date(),
  ): Promise<ProjectionAgendaDto> {
    // O painel só vê o que está na agenda agora. Ocultos fora dela (horário
    // desativado, evento despublicado ou além da janela) continuam ocultos, para
    // não voltarem ao telão quando reaparecerem.
    const [current, stored] = await Promise.all([
      this.getAgendaForTenant(tenantId, now),
      this.prisma.projectionSettings.findUnique({ where: { tenantId } }),
    ]);
    const onAgenda = new Set(current.items.map((item) => `${item.kind}:${item.sourceId}`));
    const keep = (kind: 'event' | 'schedule', ids: string[] | undefined) =>
      (ids ?? []).filter((id) => !onAgenda.has(`${kind}:${id}`));
    const eventIds = [...new Set([...dto.hiddenEventIds, ...keep('event', stored?.hiddenEventIds)])];
    const scheduleIds = [
      ...new Set([...dto.hiddenScheduleIds, ...keep('schedule', stored?.hiddenScheduleIds)]),
    ];

    // Só ids do próprio tenant que ainda existem: o resto é descartado em silêncio.
    const [events, schedules] = await Promise.all([
      this.prisma.event.findMany({
        where: { tenantId, id: { in: eventIds } },
        select: { id: true },
      }),
      this.prisma.schedule.findMany({
        where: { tenantId, id: { in: scheduleIds } },
        select: { id: true },
      }),
    ]);
    const data: {
      hiddenEventIds: string[];
      hiddenScheduleIds: string[];
      topics?: Prisma.InputJsonValue;
    } = {
      hiddenEventIds: events.map((row) => row.id),
      hiddenScheduleIds: schedules.map((row) => row.id),
    };
    // Sem `topics` no corpo (painel antigo), os tópicos guardados ficam como estão.
    if (dto.topics) {
      const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
      const topics: ProjectionTopic[] = dto.topics.map((topic) => ({
        id: topic.id ?? randomUUID(),
        title: clean(topic.title),
        text: clean(topic.text),
        callToAction: topic.callToAction ? clean(topic.callToAction) || null : null,
        active: topic.active,
      }));
      data.topics = topics as unknown as Prisma.InputJsonValue;
    }
    await this.prisma.projectionSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });

    this.siteRevalidation.notifyContentChanged(tenantId);

    return this.getAgendaForTenant(tenantId, now);
  }
}
