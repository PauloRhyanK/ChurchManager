import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { SERMON_AI_CONFIG, type SermonAiConfig } from './ai/sermon-ai.config';
import { STRUCTURERS, type SermonStructurer, type StructureOutput } from './ai/sermon-structurer';
import { SummarizerError } from './ai/sermon-summarizer';
import { GenerationLimiter } from './ai/generation-limiter';
import { BibleService } from './bible/bible.service';
import type { CreateFromTextDto } from './dto/from-text.dto';
import { validateSermonDocument } from './sermon-document';
import { PASTE_LIMITS, buildOutlineDocument, outlineTitle, pastedLines, planOutline, planVerse, type VerseFound } from './sermon-outline';
import { SermonsService, type SermonFull } from './sermons.service';

/** Limite próprio de "Colar texto" por usuário. */
export const STRUCTURE_LIMITER = Symbol('STRUCTURE_LIMITER');

const REFUSED = 'O modelo não pôde organizar este texto. Crie a palavra e cole o texto no editor.';

/** Falha do provedor em resposta HTTP em pt-BR. `refused` é a mensagem quando o modelo recusa o texto. */
export const providerError = (error: unknown, refused = REFUSED): HttpException => {
  const reason = error instanceof SummarizerError ? error.reason : 'UNAVAILABLE';
  switch (reason) {
    case 'AUTH':
      return new ServiceUnavailableException('A chave do provedor de IA não foi aceita. Avise o administrador.');
    case 'CONFIG':
      return new ServiceUnavailableException('O modelo configurado não aceitou o pedido. Avise o administrador.');
    case 'REFUSED':
      return new UnprocessableEntityException(refused);
    case 'TRUNCATED':
    case 'INVALID':
      return new BadGatewayException('A resposta do modelo veio incompleta. Tente de novo.');
    default:
      return new ServiceUnavailableException('O provedor de IA não respondeu. Tente de novo em instantes.');
  }
};

/** "Colar texto": a IA divide o texto colado em partes e o servidor cria a palavra com o esboço montado. */
@Injectable()
export class SermonImportService {
  private readonly logger = new Logger(SermonImportService.name);

  constructor(
    private readonly sermons: SermonsService,
    private readonly bible: BibleService,
    @Inject(SERMON_AI_CONFIG) private readonly ai: SermonAiConfig,
    @Inject(STRUCTURERS) private readonly structurers: Record<string, SermonStructurer>,
    @Inject(STRUCTURE_LIMITER) private readonly limiter: GenerationLimiter,
  ) {}

  /** O que o painel precisa saber da IA: se há e quais modelos. Nunca a chave nem a configuração interna. */
  aiOptions(): { enabled: boolean; models: { id: string; label: string }[] } {
    if (!this.ai.enabled) return { enabled: false, models: [] };
    return { enabled: true, models: this.ai.models.map(({ id, label }) => ({ id, label })) };
  }

  async createFromText(user: AuthUser, dto: CreateFromTextDto): Promise<SermonFull> {
    if (!this.ai.enabled) throw new BadRequestException('Organizar texto com IA ainda não está disponível.');
    const option = dto.model === undefined ? this.ai.models[0] : this.ai.models.find((m) => m.id === dto.model);
    const structurer = option && this.structurers[option.provider];
    if (!option || !structurer) throw new BadRequestException('Modelo indisponível.');

    const lines = pastedLines(dto.text);
    if (lines.length === 0) throw new BadRequestException('Cole o texto da palavra.');
    if (lines.length > PASTE_LIMITS.lines) {
      throw new BadRequestException(`O texto passa de ${PASTE_LIMITS.lines} linhas. Cole uma parte de cada vez.`);
    }
    if (!this.limiter.take(user.userId)) {
      throw new HttpException('Você organizou textos muitas vezes na última hora. Tente de novo mais tarde.', HttpStatus.TOO_MANY_REQUESTS);
    }

    let outline: StructureOutput;
    try {
      outline = await structurer.structure({ lines, model: option.model, effort: this.ai.effort });
    } catch (error) {
      // Só reason, status, type e o modelo; de outro erro, só o nome. Nunca mensagem, corpo, texto colado ou chave.
      this.logger.warn(
        error instanceof SummarizerError
          ? `Organizar texto falhou: reason=${error.reason} status=${error.status ?? '-'} type=${error.type ?? '-'} model=${option.model}`
          : `Organizar texto falhou: ${error instanceof Error ? error.name : 'erro desconhecido'} model=${option.model}`,
      );
      throw providerError(error);
    }

    const parts = planOutline(lines, outline.blocks);
    const verses = new Map<number, VerseFound>();
    for (const [i, part] of parts.entries()) {
      if (part.kind !== 'VERSE') continue;
      const plan = planVerse(part);
      if (plan.source !== 'LOOKUP') continue;
      verses.set(i, await this.lookup(plan.reference));
    }

    let doc;
    try {
      doc = validateSermonDocument(buildOutlineDocument(parts, verses, randomUUID));
    } catch {
      throw new BadGatewayException('O texto organizado não coube no esboço. Cole uma parte menor.');
    }
    return this.sermons.createWithDocument(user, outlineTitle(outline.title, parts), doc);
  }

  /** O versículo pela referência, na tradução padrão. Nulo quando não há Bíblia importada ou a referência não existe nela. */
  private async lookup(reference: string): Promise<VerseFound> {
    const result = await this.bible.search(reference);
    const hit = result.mode === 'REFERENCE' ? result.hits[0] : undefined;
    return hit ? { reference: hit.reference, translation: hit.translation, verses: hit.verses } : null;
  }
}
