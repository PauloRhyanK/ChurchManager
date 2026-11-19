import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user';
import { formatReference, parseReference } from './bible/bible-reference';
import { syncDeliveryCopy } from './delivery-copy';
import type { GenerateSlidesDto, SaveSlidesDto } from './dto/slides.dto';
import { validateSermonDocument } from './sermon-document';
import {
  SLIDE_LIMITS,
  buildSlides,
  editableTextFits,
  mergeSlides,
  parseStoredSlides,
  readSlideMode,
  type SlideItem,
  type SlideKind,
  type SlideMode,
  type SlideStyle,
} from './sermon-slides';
import { SermonsService, toSermonFull, type SermonFull } from './sermons.service';

/** Só a Capa e o Ponto têm o título editável; versículo e lista vêm sempre do esboço. */
const EDITABLE: SlideKind[] = ['TITLE', 'POINT'];
const staleList = () => new BadRequestException('A lista de slides está desatualizada. Atualize a página.');

/**
 * A referência entre parênteses num item de lista, por extenso: "Gn 37:5" → "Gênesis 37:5". Aceita também o "l"
 * minúsculo digitado no lugar do "1" ("l Reis 3.5" → "1 Reis 3:5"). Nulo quando não é uma referência com capítulo.
 */
export function normalizeListReference(text: string): string | null {
  if (!/\d/.test(text)) return null;
  const parsed = parseReference(text) ?? (/^l\s/.test(text) ? parseReference(`1${text.slice(1)}`) : null);
  return parsed ? formatReference(parsed) : null;
}

/** Slides da palavra. Só o autor lê e grava; o envio recebe só a parte pública. */
@Injectable()
export class SermonSlidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sermons: SermonsService,
  ) {}

  async generate(user: AuthUser, sermonId: string, dto: GenerateSlidesDto): Promise<SermonFull> {
    const mode = dto.mode;
    return this.write(user, sermonId, (current) => {
      const fresh = buildSlides(current.title, validateSermonDocument(current.document), mode, normalizeListReference);
      const previous = parseStoredSlides(current.slides);
      const slides = readSlideMode(current.slideMode) === mode && previous.length > 0 ? mergeSlides(previous, fresh) : fresh;
      // A revisão lida: se o documento mudar no meio, os slides ficam marcados como desatualizados.
      return { slides, slideMode: mode, slidesRevision: current.revision, ...(dto.style ? { slideStyle: dto.style } : {}) };
    });
  }

  async save(user: AuthUser, sermonId: string, dto: SaveSlidesDto): Promise<SermonFull> {
    return this.write(user, sermonId, (current) => {
      const stored = parseStoredSlides(current.slides);
      const byId = new Map(stored.map((s) => [s.id, s]));
      const ids = dto.items.map((i) => i.id);
      if (ids.length !== stored.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
        throw staleList();
      }
      const items: SlideItem[] = dto.items.map((input) => {
        const saved = byId.get(input.id)!;
        if (saved.kind === 'PRIVATE') return { ...saved, included: false };
        const next: SlideItem = { ...saved, included: input.included };
        if (input.text === undefined || !EDITABLE.includes(saved.kind)) return next;
        const text = input.text.trim();
        if (!text) throw new BadRequestException('O texto do slide não pode ficar vazio.');
        if (text === saved.text) return next;
        if (!editableTextFits(text)) {
          throw new BadRequestException(`O título do slide passa de ${SLIDE_LIMITS.editableText} caracteres.`);
        }
        return { ...next, text, edited: true };
      });
      const slides = [...items.filter((s) => s.kind !== 'PRIVATE'), ...items.filter((s) => s.kind === 'PRIVATE')];
      return { slides, ...(dto.style ? { slideStyle: dto.style } : {}) };
    });
  }

  /** Lê a palavra do autor, grava o que `change` devolve com o filtro de tenant e autor e atualiza o envio. */
  private async write(
    user: AuthUser,
    sermonId: string,
    change: (current: Awaited<ReturnType<SermonsService['findOwned']>>) => {
      slides: SlideItem[];
      slideMode?: SlideMode;
      slidesRevision?: number;
      slideStyle?: SlideStyle;
    },
  ): Promise<SermonFull> {
    const now = this.sermons.clock();
    const timeZone = this.sermons.timeZone();
    const saved = await this.prisma.$transaction(async (tx) => {
      const current = await this.sermons.findOwned(user, sermonId, tx);
      const { slides, ...rest } = change(current);
      const done = await tx.sermon.updateMany({
        where: { id: sermonId, tenantId: user.tenantId, authorId: user.userId },
        data: { ...rest, slides: slides as unknown as Prisma.InputJsonValue },
      });
      if (done.count === 0) throw new NotFoundException('Palavra não encontrada.');
      const after = await this.sermons.findOwned(user, sermonId, tx);
      await syncDeliveryCopy(tx, after, now, timeZone);
      return after;
    });
    return toSermonFull(saved, now, timeZone);
  }
}
