import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user';
import { syncDeliveryCopy } from './delivery-copy';
import type { GenerateSlidesDto, SaveSlidesDto } from './dto/slides.dto';
import { GenerationLimiter } from './ai/generation-limiter';
import type { SermonAiConfig } from './ai/sermon-ai.config';
import { SUMMARIZERS, SummarizerError, type SermonSummarizer } from './ai/sermon-summarizer';
import { validateSermonDocument } from './sermon-document';
import {
  SLIDE_LIMITS,
  buildSlides,
  cleanSummaries,
  mergeSlides,
  parseStoredSlides,
  summaryTargets,
  type SlideItem,
  type SlideKind,
} from './sermon-slides';
import { SermonsService, toSermonFull, type SermonFull } from './sermons.service';

const EDITABLE: SlideKind[] = ['POINT', 'TITLE', 'SUMMARY'];
/** Token de injeção da configuração da IA dos slides completos (lida do ambiente na subida). */
export const SERMON_AI_CONFIG = Symbol('SERMON_AI_CONFIG');

const providerError = (error: unknown): HttpException => {
  const reason = error instanceof SummarizerError ? error.reason : 'UNAVAILABLE';
  switch (reason) {
    case 'AUTH':
      return new ServiceUnavailableException('A chave do provedor de IA não foi aceita. Avise o administrador.');
    case 'CONFIG':
      return new ServiceUnavailableException('O modelo configurado não aceitou o pedido. Avise o administrador.');
    case 'REFUSED':
      return new UnprocessableEntityException('O modelo não pôde resumir esta palavra. Use “Versículos e pontos”.');
    case 'TRUNCATED':
    case 'INVALID':
      return new BadGatewayException('A resposta do modelo veio incompleta. Tente de novo.');
    default:
      return new ServiceUnavailableException('O provedor de IA não respondeu. Tente de novo em instantes.');
  }
};
const staleList = () => new BadRequestException('A lista de slides está desatualizada. Atualize a página.');

/** Slides da palavra. Só o autor lê e grava; o envio recebe só a parte pública. */
@Injectable()
export class SermonSlidesService {
  private readonly logger = new Logger(SermonSlidesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sermons: SermonsService,
    @Inject(SERMON_AI_CONFIG) private readonly ai: SermonAiConfig,
    @Inject(SUMMARIZERS) private readonly summarizers: Record<string, SermonSummarizer>,
    private readonly limiter: GenerationLimiter,
  ) {}

  /** O que o painel precisa saber da IA: se há e quais modelos. Nunca a chave nem a configuração interna. */
  aiOptions(): { enabled: boolean; models: { id: string; label: string }[] } {
    if (!this.ai.enabled) return { enabled: false, models: [] };
    return { enabled: true, models: this.ai.models.map(({ id, label }) => ({ id, label })) };
  }

  async generate(user: AuthUser, sermonId: string, dto: GenerateSlidesDto): Promise<SermonFull> {
    if (dto.mode === 'FULL') return this.generateFull(user, sermonId, dto);
    const mode = dto.mode;
    return this.write(user, sermonId, (current) => {
      const fresh = buildSlides(current.title, validateSermonDocument(current.document), mode);
      const previous = parseStoredSlides(current.slides);
      const slides = current.slideMode === mode && previous.length > 0 ? mergeSlides(previous, fresh) : fresh;
      // A revisão lida: se o documento mudar no meio, os slides ficam marcados como desatualizados.
      return { slides, slideMode: mode, slidesRevision: current.revision, ...(dto.style ? { slideStyle: dto.style } : {}) };
    });
  }

  /** "Slides completos": o provedor é chamado fora da transação; a gravação confere a revisão lida antes dele. */
  private async generateFull(user: AuthUser, sermonId: string, dto: GenerateSlidesDto): Promise<SermonFull> {
    if (!this.ai.enabled) throw new BadRequestException('Slides completos ainda não estão disponíveis.');
    const option = dto.model === undefined ? this.ai.models[0] : this.ai.models.find((m) => m.id === dto.model);
    const summarizer = option && this.summarizers[option.provider];
    if (!option || !summarizer) throw new BadRequestException('Modelo indisponível.');

    const read = await this.sermons.findOwned(user, sermonId);
    const doc = validateSermonDocument(read.document);
    const targets = summaryTargets(doc);
    let summaries: Record<string, string> = {};
    if (targets.length > 0) {
      if (!this.limiter.take(user.userId)) {
        throw new HttpException(
          'Você gerou slides completos muitas vezes na última hora. Tente de novo mais tarde.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      try {
        const raw = await summarizer.summarize({ title: read.title, targets, model: option.model, effort: this.ai.effort });
        summaries = cleanSummaries(targets, raw);
      } catch (error) {
        // Só reason, status, type e o modelo; de outro erro, só o nome. Nunca mensagem, corpo ou chave.
        this.logger.warn(
          error instanceof SummarizerError
            ? `Resumo por IA falhou: reason=${error.reason} status=${error.status ?? '-'} type=${error.type ?? '-'} model=${option.model}`
            : `Resumo por IA falhou: ${error instanceof Error ? error.name : 'erro desconhecido'} model=${option.model}`,
        );
        throw providerError(error);
      }
    }
    return this.write(user, sermonId, (current) => {
      if (current.revision !== read.revision) {
        throw new ConflictException('A palavra mudou enquanto os slides eram gerados. Gere de novo.');
      }
      const previous = parseStoredSlides(current.slides);
      // Frase editada pelo pregador continua mesmo se o modelo, desta vez, não devolver aquele alvo.
      const targetIds = new Set(targets.map((t) => t.id));
      const kept = { ...summaries };
      for (const p of previous) {
        if (p.kind === 'SUMMARY' && p.edited && targetIds.has(p.id) && !(p.id in kept)) kept[p.id] = p.text;
      }
      const fresh = buildSlides(current.title, doc, 'FULL', kept);
      const slides = current.slideMode === 'FULL' && previous.length > 0 ? mergeSlides(previous, fresh) : fresh;
      return { slides, slideMode: 'FULL', slidesRevision: current.revision, ...(dto.style ? { slideStyle: dto.style } : {}) };
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
      slideMode?: 'VERSES' | 'VERSES_AND_POINTS' | 'FULL';
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
