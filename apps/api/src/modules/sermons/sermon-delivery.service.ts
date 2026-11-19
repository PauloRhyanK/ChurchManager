import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user';
import { matchDeliveries } from './delivery-match';
import type { SendSermonDto } from './dto/delivery.dto';
import { SermonsService, toSermonFull, type SermonFull } from './sermons.service';

type Tx = Prisma.TransactionClient;

export interface ServiceOption {
  id: string;
  date: string;
  startTime: string;
  name: string;
  hasSermon: boolean;
  isMine: boolean;
}
export interface DeliveryPreview {
  service: { id: string; date: string; startTime: string; name: string } | null;
  occupied: boolean;
}

const toDate = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Data inválida.');
  }
  return date;
};
const ymd = (date: Date) => date.toISOString().slice(0, 10);
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const hasSermonConflict = () =>
  new ConflictException({ code: 'SERVICE_HAS_SERMON', message: 'Este culto já tem uma palavra.' });
const BY_TIME = [{ startTime: 'asc' }, { id: 'asc' }] as const;
const MAX_OPTIONS = 8;

/** O envio: a cópia pública da palavra que o módulo de culto lê. Nunca lê `sermons` sem o filtro de autor. */
@Injectable()
export class SermonDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sermons: SermonsService,
  ) {}

  private today(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.sermons.timeZone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(this.sermons.clock());
  }

  async serviceOptions(user: AuthUser): Promise<ServiceOption[]> {
    const rows = await this.prisma.worshipService.findMany({
      where: { tenantId: user.tenantId, date: { gte: toDate(this.today()) } },
      include: { sermonDelivery: { select: { authorId: true } } },
      orderBy: [{ date: 'asc' }, ...BY_TIME],
      take: MAX_OPTIONS,
    });
    return rows.map((s) => ({
      id: s.id,
      date: ymd(s.date),
      startTime: s.startTime,
      name: s.name,
      hasSermon: !!s.sermonDelivery,
      isMine: s.sermonDelivery?.authorId === user.userId,
    }));
  }

  /** O culto mais próximo da hora (empate: o mais cedo) e se já tem palavra. */
  async preview(tenantId: string, date: string, startTime: string, tx: Tx | PrismaService = this.prisma): Promise<DeliveryPreview> {
    const services = await tx.worshipService.findMany({
      where: { tenantId, date: toDate(date) },
      orderBy: [...BY_TIME],
    });
    const want = minutesOf(startTime);
    let best: (typeof services)[number] | null = null;
    for (const s of services) {
      const diff = Math.abs(minutesOf(s.startTime) - want);
      if (!best || diff < Math.abs(minutesOf(best.startTime) - want)) best = s;
    }
    if (!best) return { service: null, occupied: false };
    const holder = await tx.sermonDelivery.findFirst({ where: { tenantId, serviceId: best.id } });
    return {
      service: { id: best.id, date: ymd(best.date), startTime: best.startTime, name: best.name },
      occupied: !!holder,
    };
  }

  async send(user: AuthUser, sermonId: string, dto: SendSermonDto): Promise<SermonFull> {
    const byService = dto.serviceId != null;
    const byDate = dto.date != null && dto.startTime != null;
    const anyDate = dto.date != null || dto.startTime != null;
    if (byService ? anyDate : !byDate) {
      throw new BadRequestException('Escolha um culto ou informe a data e a hora.');
    }
    if (byDate) toDate(dto.date!);

    const saved = await this.prisma.$transaction(async (tx) => {
      const sermon = await this.sermons.findOwned(user, sermonId, tx);
      const account = await tx.adminUser.findFirst({
        where: { id: user.userId, tenantId: user.tenantId },
        select: { name: true },
      });
      const copy = {
        title: sermon.title,
        preacherName: account?.name?.trim() || user.email,
        estimatedSeconds: sermon.estimatedSeconds,
      };
      const previous = sermon.delivery;
      const oldDate = previous ? ymd(previous.date) : null;
      const save = async (where: { date: string; startTime: string; serviceId: string | null; pinned: boolean }) => {
        const data = {
          ...copy,
          date: toDate(where.date),
          startTime: where.startTime,
          serviceId: where.serviceId,
          pinned: where.pinned,
          // Quem é reenviado entra no fim da fila da data: não passa na frente de quem já espera o culto.
          createdAt: this.sermons.clock(),
        };
        if (previous) return tx.sermonDelivery.update({ where: { id: previous.id }, data });
        return tx.sermonDelivery.create({
          data: { ...data, tenantId: user.tenantId, authorId: user.userId, sermonId: sermon.id },
        });
      };

      let newDate: string;
      if (byService) {
        const service = await tx.worshipService.findFirst({ where: { id: dto.serviceId, tenantId: user.tenantId } });
        if (!service) throw new NotFoundException('Culto não encontrado.');
        const holder = await tx.sermonDelivery.findFirst({ where: { tenantId: user.tenantId, serviceId: service.id } });
        if (holder && holder.sermonId !== sermon.id) {
          if (!dto.replace) throw hasSermonConflict();
          await tx.sermonDelivery.delete({ where: { id: holder.id } });
        }
        newDate = ymd(service.date);
        await save({ date: newDate, startTime: service.startTime, serviceId: service.id, pinned: true });
      } else {
        newDate = dto.date!;
        await save({ date: newDate, startTime: dto.startTime!, serviceId: null, pinned: false });
        await this.rematch(tx, user.tenantId, [newDate]);
      }

      // O culto que a palavra deixou volta à disputa.
      if (oldDate) await this.rematch(tx, user.tenantId, [oldDate]);

      if (byDate) {
        const mine = await tx.sermonDelivery.findFirst({ where: { sermonId: sermon.id, tenantId: user.tenantId } });
        if (mine && mine.serviceId === null) {
          const near = await this.preview(user.tenantId, newDate, dto.startTime!, tx);
          if (near.service && near.occupied) {
            if (!dto.replace) throw hasSermonConflict();
            const holder = await tx.sermonDelivery.findFirst({
              where: { tenantId: user.tenantId, serviceId: near.service.id },
            });
            if (holder) await tx.sermonDelivery.delete({ where: { id: holder.id } });
            await tx.sermonDelivery.update({
              where: { id: mine.id },
              data: { serviceId: near.service.id, pinned: true },
            });
          }
        }
      }
      return this.sermons.findOwned(user, sermonId, tx);
    });
    return toSermonFull(saved, this.sermons.clock(), this.sermons.timeZone());
  }

  async cancel(user: AuthUser, sermonId: string): Promise<SermonFull> {
    const saved = await this.prisma.$transaction(async (tx) => {
      const sermon = await this.sermons.findOwned(user, sermonId, tx);
      if (sermon.delivery) {
        await tx.sermonDelivery.delete({ where: { id: sermon.delivery.id } });
        await this.rematch(tx, user.tenantId, [ymd(sermon.delivery.date)]);
      }
      return this.sermons.findOwned(user, sermonId, tx);
    });
    return toSermonFull(saved, this.sermons.clock(), this.sermons.timeZone());
  }

  /** Reaplica o casamento por data e hora e grava só o que mudou. Para o módulo de culto também. */
  async rematch(tx: Tx, tenantId: string, dates: string[]): Promise<void> {
    for (const day of [...new Set(dates)]) {
      const date = toDate(day);
      const services = await tx.worshipService.findMany({ where: { tenantId, date }, orderBy: [...BY_TIME] });
      const deliveries = await tx.sermonDelivery.findMany({
        where: { tenantId, date },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const result = matchDeliveries(services, deliveries);
      const changed = deliveries.filter((x) => (result.get(x.id) ?? null) !== x.serviceId);
      // serviceId é único: libera primeiro, atribui depois, para a troca não colidir no meio.
      for (const x of changed) {
        if (x.serviceId !== null) await tx.sermonDelivery.update({ where: { id: x.id }, data: { serviceId: null } });
      }
      for (const x of changed) {
        const next = result.get(x.id) ?? null;
        if (next !== null) await tx.sermonDelivery.update({ where: { id: x.id }, data: { serviceId: next } });
      }
    }
  }

  /** O envio fixado ao culto copia a nova data e hora dele. */
  async followService(tx: Tx, tenantId: string, service: { id: string; date: string; startTime: string }): Promise<void> {
    await tx.sermonDelivery.updateMany({
      where: { tenantId, serviceId: service.id, pinned: true },
      data: { date: toDate(service.date), startTime: service.startTime },
    });
  }

  /** O culto vai embora: o envio dele volta à disputa por data e hora. */
  async releaseService(tx: Tx, tenantId: string, serviceId: string): Promise<void> {
    await tx.sermonDelivery.updateMany({ where: { tenantId, serviceId }, data: { pinned: false, serviceId: null } });
  }

  /** Só o que o módulo de culto pode ver: lê apenas `sermonDelivery`. */
  async summaries(
    tenantId: string,
    serviceIds: string[],
  ): Promise<Map<string, { title: string; preacherName: string; estimatedMinutes: number }>> {
    const out = new Map<string, { title: string; preacherName: string; estimatedMinutes: number }>();
    if (serviceIds.length === 0) return out;
    const rows = await this.prisma.sermonDelivery.findMany({
      where: { tenantId, serviceId: { in: serviceIds } },
      select: { serviceId: true, title: true, preacherName: true, estimatedSeconds: true },
    });
    for (const r of rows) {
      if (!r.serviceId) continue;
      out.set(r.serviceId, {
        title: r.title,
        preacherName: r.preacherName,
        estimatedMinutes: Math.ceil(r.estimatedSeconds / 60),
      });
    }
    return out;
  }
}
