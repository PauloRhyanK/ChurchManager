import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user';
import { syncDeliveryCopy } from './delivery-copy';
import { deliveryHasPassed, sermonStatus, type SermonStatus } from './delivery-match';
import { rematchDeliveries } from './delivery-rematch';
import { CreateSermonDto, UpdateSermonDto } from './dto/sermon.dto';
import { deriveSermon, normalizeSearch } from './sermon-derive';
import { EMPTY_DOC, validateSermonDocument, type SermonDoc } from './sermon-document';
import { buildSlides, parseStoredSlides, publicSlides, type SlideItem, type SlideMode, type SlideStyle } from './sermon-slides';

export interface SermonSummary {
  id: string;
  title: string;
  baseReference: string | null;
  pointCount: number;
  estimatedSeconds: number;
  status: SermonStatus;
  delivery: { date: string; startTime: string; serviceId: string | null; serviceName: string | null } | null;
  /** Slides marcados e não privados: o que vai para o envio. */
  slideCount: number;
  updatedAt: Date;
}
export interface SermonFull extends SermonSummary {
  document: SermonDoc;
  revision: number;
  slideMode: SlideMode | null;
  slideStyle: SlideStyle;
  slides: SlideItem[];
  /** O documento (ou o título, se o slide de título não foi editado) mudou depois da última geração dos slides. */
  slidesStale: boolean;
}

const SERMON_INCLUDE = {
  delivery: { include: { service: { select: { name: true } } } },
} satisfies Prisma.SermonInclude;

type SermonWithDelivery = Prisma.SermonGetPayload<{ include: typeof SERMON_INCLUDE }>;
type SermonRow = Omit<SermonWithDelivery, 'document' | 'revision'> & Partial<Pick<SermonWithDelivery, 'document' | 'revision'>>;

const SERMON_TIME_ZONE = 'America/Sao_Paulo';
const ymd = (date: Date) => date.toISOString().slice(0, 10);

export function toSermonSummary(sermon: SermonRow, now: Date, timeZone: string): SermonSummary {
  const delivery = sermon.delivery
    ? {
        date: ymd(sermon.delivery.date),
        startTime: sermon.delivery.startTime,
        serviceId: sermon.delivery.serviceId,
        serviceName: sermon.delivery.service?.name ?? null,
      }
    : null;
  return {
    id: sermon.id,
    title: sermon.title,
    baseReference: sermon.baseReference,
    pointCount: sermon.pointCount,
    estimatedSeconds: sermon.estimatedSeconds,
    status: sermonStatus(delivery, now, timeZone),
    delivery,
    slideCount: publicSlides(parseStoredSlides(sermon.slides)).length,
    updatedAt: sermon.updatedAt,
  };
}

/** Os slides de título (nenhum editado) já não batem com o título da palavra (aparado e dividido como na geração)? */
function titleChanged(slides: SlideItem[], title: string): boolean {
  const stored = slides.filter((s) => s.kind === 'TITLE');
  if (stored.length === 0 || stored.some((s) => s.edited)) return false;
  const expected = buildSlides(title, EMPTY_DOC, 'VERSES_AND_POINTS').filter((s) => s.kind === 'TITLE');
  return stored.map((s) => s.text).join('\n') !== expected.map((s) => s.text).join('\n');
}

export function toSermonFull(sermon: SermonWithDelivery, now: Date, timeZone: string): SermonFull {
  const slides = parseStoredSlides(sermon.slides);
  return {
    ...toSermonSummary(sermon, now, timeZone),
    document: sermon.document as unknown as SermonDoc,
    revision: sermon.revision,
    slideMode: sermon.slideMode,
    slideStyle: sermon.slideStyle,
    slides,
    slidesStale: slides.length > 0 && (sermon.slidesRevision !== sermon.revision || titleChanged(slides, sermon.title)),
  };
}

@Injectable()
export class SermonsService {
  /** Relógio injetável para os testes de situação. */
  clock: () => Date = () => new Date();

  constructor(private readonly prisma: PrismaService) {}

  /** A palavra do autor ou 404: ninguém mais a vê, nem administrador. */
  async findOwned(user: AuthUser, id: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const sermon = await tx.sermon.findFirst({
      where: { id, tenantId: user.tenantId, authorId: user.userId },
      include: SERMON_INCLUDE,
    });
    if (!sermon) throw new NotFoundException('Palavra não encontrada.');
    return sermon;
  }

  /** O tenant não tem fuso próprio no schema: vale o de Brasília para todas as igrejas. */
  timeZone(): string {
    return SERMON_TIME_ZONE;
  }

  async list(user: AuthUser, query: { q?: string; status?: SermonStatus }) {
    const timeZone = this.timeZone();
    const rows = await this.prisma.sermon.findMany({
      where: { tenantId: user.tenantId, authorId: user.userId },
      omit: { document: true },
      include: SERMON_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    const now = this.clock();
    const term = normalizeSearch(query.q ?? '');
    const found = term
      ? rows.filter((s) => normalizeSearch(s.title).includes(term) || s.verseRefs.includes(term))
      : rows;
    const all = found.map((s) => toSermonSummary(s, now, timeZone));
    const counts = {
      all: all.length,
      draft: all.filter((s) => s.status === 'DRAFT').length,
      sent: all.filter((s) => s.status === 'SENT').length,
      preached: all.filter((s) => s.status === 'PREACHED').length,
    };
    return { items: query.status ? all.filter((s) => s.status === query.status) : all, counts };
  }

  async create(user: AuthUser, dto: CreateSermonDto): Promise<SermonFull> {
    const sermon = await this.prisma.sermon.create({
      data: {
        tenantId: user.tenantId,
        authorId: user.userId,
        title: dto.title ?? 'Sem título',
        document: EMPTY_DOC as unknown as Prisma.InputJsonValue,
      },
      include: SERMON_INCLUDE,
    });
    return toSermonFull(sermon, this.clock(), this.timeZone());
  }

  /** Palavra nova já com o esboço (de "Colar texto"). O documento chega validado; tenant e autor vêm do JWT. */
  async createWithDocument(user: AuthUser, title: string, doc: SermonDoc): Promise<SermonFull> {
    const derived = deriveSermon(doc);
    const sermon = await this.prisma.sermon.create({
      data: {
        tenantId: user.tenantId,
        authorId: user.userId,
        title,
        document: doc as unknown as Prisma.InputJsonValue,
        baseReference: derived.baseReference,
        pointCount: derived.pointCount,
        verseRefs: derived.verseRefs,
        estimatedSeconds: derived.estimatedSeconds,
      },
      include: SERMON_INCLUDE,
    });
    return toSermonFull(sermon, this.clock(), this.timeZone());
  }

  async get(user: AuthUser, id: string): Promise<SermonFull> {
    const sermon = await this.findOwned(user, id);
    return toSermonFull(sermon, this.clock(), this.timeZone());
  }

  async update(user: AuthUser, id: string, dto: UpdateSermonDto): Promise<SermonFull> {
    const timeZone = this.timeZone();
    const now = this.clock();
    const doc = dto.document !== undefined ? validateSermonDocument(dto.document) : null;
    const derived = doc ? deriveSermon(doc) : null;
    const conflict = () =>
      new ConflictException('Esta palavra foi alterada em outra aba. Recarregue para continuar.');

    const saved = await this.prisma.$transaction(async (tx) => {
      // Lê dentro da transação: o envio e a revisão agem sobre o que existe agora.
      const current = await this.findOwned(user, id, tx);
      if (doc && dto.baseRevision !== undefined && dto.baseRevision !== current.revision) throw conflict();
      const title = dto.title ?? current.title;
      const data: Prisma.SermonUpdateManyMutationInput = { title };
      if (doc && derived) {
        Object.assign(data, {
          document: doc as unknown as Prisma.InputJsonValue,
          baseReference: derived.baseReference,
          pointCount: derived.pointCount,
          verseRefs: derived.verseRefs,
          estimatedSeconds: derived.estimatedSeconds,
          revision: { increment: 1 },
        });
      }
      // A revisão lida entra no filtro: duas abas não gravam por cima uma da outra.
      const done = await tx.sermon.updateMany({
        where: { id, tenantId: user.tenantId, authorId: user.userId, ...(doc ? { revision: current.revision } : {}) },
        data,
      });
      if (done.count === 0) throw conflict();
      // O autosave não mexe nos slides; o envio recebe o título e o tempo novos (e os slides de sempre).
      const after = await this.findOwned(user, id, tx);
      await syncDeliveryCopy(tx, after, now, timeZone);
      return after;
    });
    return toSermonFull(saved, now, timeZone);
  }

  async duplicate(user: AuthUser, id: string): Promise<SermonFull> {
    const source = await this.findOwned(user, id);
    const timeZone = this.timeZone();
    const copy = await this.prisma.sermon.create({
      data: {
        tenantId: user.tenantId,
        authorId: user.userId,
        title: `${source.title.slice(0, 255 - ' (cópia)'.length)} (cópia)`,
        document: source.document as Prisma.InputJsonValue,
        baseReference: source.baseReference,
        pointCount: source.pointCount,
        verseRefs: source.verseRefs,
        estimatedSeconds: source.estimatedSeconds,
      },
      include: SERMON_INCLUDE,
    });
    return toSermonFull(copy, this.clock(), timeZone);
  }

  async remove(user: AuthUser, id: string): Promise<{ success: true }> {
    const timeZone = this.timeZone();
    const now = this.clock();
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findOwned(user, id, tx);
      const delivery = current.delivery;
      const freed = delivery && !deliveryHasPassed(ymd(delivery.date), delivery.startTime, now, timeZone) ? delivery : null;
      if (freed) await tx.sermonDelivery.delete({ where: { id: freed.id } });
      const done = await tx.sermon.deleteMany({ where: { id, tenantId: user.tenantId, authorId: user.userId } });
      if (done.count === 0) throw new NotFoundException('Palavra não encontrada.');
      // O culto que a palavra deixou volta à disputa (a palavra guardada de outro pregador pode entrar).
      if (freed) await rematchDeliveries(tx, user.tenantId, [ymd(freed.date)]);
    });
    return { success: true };
  }
}
