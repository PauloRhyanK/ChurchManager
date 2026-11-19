import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user';
import { syncDeliveryCopy } from './delivery-copy';
import type { GenerateSlidesDto, SaveSlidesDto } from './dto/slides.dto';
import { validateSermonDocument } from './sermon-document';
import { SLIDE_LIMITS, buildSlides, mergeSlides, parseStoredSlides, type SlideItem, type SlideKind } from './sermon-slides';
import { SermonsService, toSermonFull, type SermonFull } from './sermons.service';

const EDITABLE: SlideKind[] = ['POINT', 'TITLE', 'SUMMARY'];
const staleList = () => new BadRequestException('A lista de slides está desatualizada. Atualize a página.');

/** Slides da palavra. Só o autor lê e grava; o envio recebe só a parte pública. */
@Injectable()
export class SermonSlidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sermons: SermonsService,
  ) {}

  async generate(user: AuthUser, sermonId: string, dto: GenerateSlidesDto): Promise<SermonFull> {
    if (dto.mode === 'FULL') throw new BadRequestException('Slides completos ainda não estão disponíveis.');
    const mode = dto.mode;
    return this.write(user, sermonId, (current) => {
      const fresh = buildSlides(current.title, validateSermonDocument(current.document), mode);
      const previous = parseStoredSlides(current.slides);
      const slides = current.slideMode === mode && previous.length > 0 ? mergeSlides(previous, fresh) : fresh;
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
        const next = { ...saved, included: input.included };
        if (input.text !== undefined && EDITABLE.includes(saved.kind)) {
          const text = input.text.trim();
          if (text.length < 1 || text.length > SLIDE_LIMITS.textChars) {
            throw new BadRequestException(`O texto do slide deve ter de 1 a ${SLIDE_LIMITS.textChars} caracteres.`);
          }
          if (text !== saved.text) Object.assign(next, { text, edited: true });
        }
        return next;
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
      slideMode?: 'VERSES' | 'VERSES_AND_POINTS';
      slidesRevision?: number;
      slideStyle?: 'MINIMAL' | 'BACKGROUND';
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
