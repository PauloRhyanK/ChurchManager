import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user';
import { deliveryCopy, readDeliverySlides } from './delivery-copy';
import { SLIDE_IMAGE_HEIGHT, SLIDE_IMAGE_WIDTH, deliveryVersion, readSlideImages, slideHash } from './delivery-images';
import { deliveryHasPassed } from './delivery-match';
import { rematchDeliveries } from './delivery-rematch';
import type { SendSermonDto } from './dto/delivery.dto';
import type { PublicSlide, SlideStyle } from './sermon-slides';
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
export interface DeliverySummary {
  title: string;
  preacherName: string;
  estimatedMinutes: number;
  slideCount: number;
}
/** Um slide no formato da Ponte. Sem imagem (`imageUrl: null`), a Ponte mostra o texto. */
export interface PonteSlide {
  index: number;
  kind: PublicSlide['kind'];
  title: string;
  text: string;
  reference: string | null;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
}
/** A palavra para a Ponte: os campos do resumo e mais a versão e os slides com as imagens. */
export interface PonteSermon extends DeliverySummary {
  version: string;
  slides: PonteSlide[];
}
export interface ServiceSlides {
  title: string;
  preacherName: string;
  slideStyle: SlideStyle;
  slides: PublicSlide[];
  /** A palavra de quem olha, para o atalho "editar"; `null` para os demais. */
  mySermonId: string | null;
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
const serviceHasPassed = () => new BadRequestException('Este culto já aconteceu.');
const BY_TIME = [{ startTime: 'asc' }, { id: 'asc' }] as const;
const MAX_OPTIONS = 8;

/** Dois envios ao mesmo culto ao mesmo tempo: o segundo bate na unicidade de `service_id`. */
function isServiceUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown; meta?: { target?: unknown } } | null;
  if (e?.code !== 'P2002') return false;
  const target = JSON.stringify(e.meta?.target ?? '');
  return !/sermon_?id/i.test(target) || /service_?id/i.test(target);
}

/** O envio: a cópia pública da palavra que o módulo de culto lê. Nunca lê `sermons` sem o filtro de autor. */
@Injectable()
export class SermonDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sermons: SermonsService,
  ) {}

  /** Data (AAAA-MM-DD) e hora (HH:MM) de agora no fuso das palavras. */
  private now(): { date: string; time: string } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.sermons.timeZone(),
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(this.sermons.clock());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
  }

  private hasPassed(date: string, startTime: string): boolean {
    return deliveryHasPassed(date, startTime, this.sermons.clock(), this.sermons.timeZone());
  }

  /** Só cultos que ainda não começaram: de hoje, os de hora posterior à atual. */
  async serviceOptions(user: AuthUser): Promise<ServiceOption[]> {
    const now = this.now();
    const today = toDate(now.date);
    const rows = await this.prisma.worshipService.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [{ date: { gt: today } }, { date: today, startTime: { gt: now.time } }],
      },
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
    if (byDate) {
      toDate(dto.date!);
      if (this.hasPassed(dto.date!, dto.startTime!)) throw new BadRequestException('Escolha uma data futura.');
    }

    try {
      return await this.sendInTransaction(user, sermonId, dto, byService, byDate);
    } catch (error) {
      if (isServiceUniqueViolation(error)) throw hasSermonConflict();
      throw error;
    }
  }

  private async sendInTransaction(
    user: AuthUser,
    sermonId: string,
    dto: SendSermonDto,
    byService: boolean,
    byDate: boolean,
  ): Promise<SermonFull> {
    const saved = await this.prisma.$transaction(async (tx) => {
      const sermon = await this.sermons.findOwned(user, sermonId, tx);
      // O envio passado é o registro do que foi pregado: não sai do lugar.
      if (sermon.delivery && this.hasPassed(ymd(sermon.delivery.date), sermon.delivery.startTime)) {
        throw new BadRequestException('Esta palavra já foi pregada. Duplique a palavra para enviar de novo.');
      }
      const account = await tx.adminUser.findFirst({
        where: { id: user.userId, tenantId: user.tenantId },
        select: { name: true },
      });
      // A mesma cópia de `syncDeliveryCopy`: título, tempo, estilo e só os slides públicos.
      const copy = { ...deliveryCopy(sermon), preacherName: account?.name?.trim() || user.email };
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
        if (this.hasPassed(ymd(service.date), service.startTime)) throw serviceHasPassed();
        const holder = await tx.sermonDelivery.findFirst({ where: { tenantId: user.tenantId, serviceId: service.id } });
        if (holder && holder.sermonId !== sermon.id) {
          if (this.hasPassed(ymd(holder.date), holder.startTime)) throw serviceHasPassed();
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
            const holder = await tx.sermonDelivery.findFirst({
              where: { tenantId: user.tenantId, serviceId: near.service.id },
            });
            if (holder && this.hasPassed(ymd(holder.date), holder.startTime)) throw serviceHasPassed();
            if (!dto.replace) throw hasSermonConflict();
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
        if (this.hasPassed(ymd(sermon.delivery.date), sermon.delivery.startTime)) {
          throw new BadRequestException('Esta palavra já foi pregada.');
        }
        await tx.sermonDelivery.delete({ where: { id: sermon.delivery.id } });
        await this.rematch(tx, user.tenantId, [ymd(sermon.delivery.date)]);
      }
      return this.sermons.findOwned(user, sermonId, tx);
    });
    return toSermonFull(saved, this.sermons.clock(), this.sermons.timeZone());
  }

  /** Reaplica o casamento por data e hora e grava só o que mudou. Para o módulo de culto também. */
  async rematch(tx: Tx, tenantId: string, dates: string[]): Promise<void> {
    await rematchDeliveries(tx, tenantId, dates);
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
  async summaries(tenantId: string, serviceIds: string[]): Promise<Map<string, DeliverySummary>> {
    const out = new Map<string, DeliverySummary>();
    if (serviceIds.length === 0) return out;
    const rows = await this.prisma.sermonDelivery.findMany({
      where: { tenantId, serviceId: { in: serviceIds } },
      select: { serviceId: true, title: true, preacherName: true, estimatedSeconds: true, slides: true },
    });
    for (const r of rows) {
      if (!r.serviceId) continue;
      out.set(r.serviceId, {
        title: r.title,
        preacherName: r.preacherName,
        estimatedMinutes: Math.ceil(r.estimatedSeconds / 60),
        slideCount: readDeliverySlides(r.slides).length,
      });
    }
    return out;
  }

  /**
   * A palavra do culto para a Ponte (contrato em docs/api/ponte-palavra.md). Os campos do resumo
   * continuam; `version` e `slides` são acréscimos. Só vale imagem cujo hash é o de um slide atual.
   */
  async forPonte(tenantId: string, serviceId: string): Promise<PonteSermon | null> {
    const row = await this.prisma.sermonDelivery.findFirst({
      where: { tenantId, serviceId },
      select: {
        title: true,
        preacherName: true,
        estimatedSeconds: true,
        slideStyle: true,
        slides: true,
        slideImages: true,
      },
    });
    if (!row) return null;
    const slides = readDeliverySlides(row.slides);
    const images = readSlideImages(row.slideImages);
    const hashes = slides.map((slide) => slideHash(row.slideStyle, slide));
    return {
      title: row.title,
      preacherName: row.preacherName,
      estimatedMinutes: Math.ceil(row.estimatedSeconds / 60),
      slideCount: slides.length,
      version: deliveryVersion(row.slideStyle, row.title, hashes),
      slides: slides.map((slide, index) => {
        const imageUrl = images[hashes[index]] ?? null;
        return {
          index,
          kind: slide.kind,
          title: slide.title,
          text: slide.text,
          reference: slide.reference,
          imageUrl,
          width: imageUrl ? SLIDE_IMAGE_WIDTH : null,
          height: imageUrl ? SLIDE_IMAGE_HEIGHT : null,
        };
      }),
    };
  }

  /** Os slides do culto para a prévia do roteiro. Lê só `sermonDelivery`, do tenant de quem chama. */
  async slidesForService(tenantId: string, serviceId: string, viewerUserId: string): Promise<ServiceSlides | null> {
    const row = await this.prisma.sermonDelivery.findFirst({
      where: { tenantId, serviceId },
      select: { title: true, preacherName: true, slideStyle: true, slides: true, sermonId: true, authorId: true },
    });
    if (!row) return null;
    return {
      title: row.title,
      preacherName: row.preacherName,
      slideStyle: row.slideStyle,
      slides: readDeliverySlides(row.slides),
      mySermonId: row.authorId !== null && row.authorId === viewerUserId ? row.sermonId : null,
    };
  }
}
