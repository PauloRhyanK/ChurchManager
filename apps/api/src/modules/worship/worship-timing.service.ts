import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GenerationLimiter } from '../sermons/ai/generation-limiter';
import type { SermonAiConfig } from '../sermons/ai/sermon-ai.config';
import { SummarizerError } from '../sermons/ai/sermon-summarizer';
import { TIMING_ALIGNER, TimingAligner, WORSHIP_AI_CONFIG } from './ai/timing-aligner';
import type { LyricsSettingsDto, TimingCorrectionDto, TimingSettingsDto, TimingSuggestDto } from './dto/timing.dto';
import {
  LEAD_LIMITS,
  SuggestionRejected,
  correctionStats,
  learnFrom,
  validateSuggestion,
  type LearnedTiming,
} from './timing-learning';
import { deriveSong, normalizeRows, type WorshipRow } from './worship-document';

/** Quantas correções recentes entram no aprendizado. */
const HISTORY = 50;

const providerError = (error: unknown): HttpException => {
  const reason = error instanceof SummarizerError ? error.reason : 'UNAVAILABLE';
  switch (reason) {
    case 'AUTH':
      return new ServiceUnavailableException('A chave do provedor de IA não foi aceita. Avise o administrador.');
    case 'CONFIG':
      return new ServiceUnavailableException('O modelo configurado não aceitou o pedido. Avise o administrador.');
    case 'REFUSED':
      return new UnprocessableEntityException('O modelo não quis ajustar estes tempos. Ajuste à mão.');
    case 'TRUNCATED':
    case 'INVALID':
      return new BadGatewayException('A resposta do modelo veio incompleta. Tente de novo.');
    default:
      return new ServiceUnavailableException('O provedor de IA não respondeu. Tente de novo em instantes.');
  }
};

/** Lista de tempos vinda do painel: só número ≥ 0 ou null. */
function readTimes(list: unknown[], label: string): (number | null)[] {
  return list.map((v) => {
    if (v === null) return null;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new BadRequestException(`Tempos inválidos em ${label}.`);
    return Math.round(v * 100) / 100;
  });
}

/** Antecipação, aprendizado e ajuste por instrução dos tempos dos slides. */
@Injectable()
export class WorshipTimingService {
  private readonly logger = new Logger(WorshipTimingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WORSHIP_AI_CONFIG) private readonly ai: SermonAiConfig,
    @Inject(TIMING_ALIGNER) private readonly aligner: TimingAligner | null,
    private readonly limiter: GenerationLimiter,
  ) {}

  async settings(tenantId: string) {
    const saved = await this.prisma.worshipSettings.findUnique({ where: { tenantId } });
    return {
      slideLeadSeconds: saved?.slideLeadSeconds ?? LEAD_LIMITS.default,
      aiEnabled: !!this.aligner && this.ai.enabled,
    };
  }

  async setSettings(tenantId: string, dto: TimingSettingsDto) {
    const data = { slideLeadSeconds: Math.round(dto.slideLeadSeconds * 100) / 100 };
    await this.prisma.worshipSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    return this.settings(tenantId);
  }

  async lyricsSettings(tenantId: string) {
    const saved = await this.prisma.worshipSettings.findUnique({ where: { tenantId } });
    return { lyricMaxChars: saved?.lyricMaxChars ?? 28, lyricMaxLines: saved?.lyricMaxLines ?? 3 };
  }

  async setLyricsSettings(tenantId: string, dto: LyricsSettingsDto) {
    await this.prisma.worshipSettings.upsert({
      where: { tenantId },
      create: { tenantId, lyricMaxChars: dto.lyricMaxChars, lyricMaxLines: dto.lyricMaxLines },
      update: { lyricMaxChars: dto.lyricMaxChars, lyricMaxLines: dto.lyricMaxLines },
    });
    return this.lyricsSettings(tenantId);
  }

  async learned(tenantId: string): Promise<LearnedTiming> {
    const records = await this.prisma.worshipTimingCorrection.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY,
      select: { source: true, instruction: true, changedSlides: true, meanDeltaSeconds: true, slideShift: true },
    });
    return learnFrom(records);
  }

  private async slidesOf(tenantId: string, songId: string) {
    const song = await this.prisma.worshipSong.findFirst({ where: { id: songId, tenantId } });
    if (!song) throw new NotFoundException('Música não encontrada');
    const rows = normalizeRows(Array.isArray(song.rows) ? (song.rows as unknown as WorshipRow[]) : []);
    return { song, ...deriveSong(rows) };
  }

  async recordCorrection(tenantId: string, songId: string, dto: TimingCorrectionDto) {
    const { slides } = await this.slidesOf(tenantId, songId);
    const before = readTimes(dto.before, 'antes');
    const after = readTimes(dto.after, 'depois');
    if (before.length !== slides.length || after.length !== slides.length) {
      throw new BadRequestException('A lista de slides está desatualizada. Atualize a página.');
    }
    const stats = correctionStats(before, after);
    if (stats.changedSlides === 0) return { recorded: false };
    await this.prisma.worshipTimingCorrection.create({
      data: {
        tenantId,
        songId,
        source: dto.source,
        instruction: dto.source === 'INSTRUCTION' ? (dto.instruction ?? null) : null,
        ...stats,
        before,
        after,
      },
    });
    return { recorded: true, ...stats };
  }

  async suggest(tenantId: string, userId: string, songId: string, dto: TimingSuggestDto) {
    const option = this.ai.models[0];
    if (!this.aligner || !this.ai.enabled || !option) throw new BadRequestException('O ajuste por IA ainda não está disponível.');
    const { song, parts, slides } = await this.slidesOf(tenantId, songId);
    if (!slides.length) throw new BadRequestException('A música ainda não tem slides.');
    if (!this.limiter.take(userId)) {
      throw new HttpException('Você pediu ajustes à IA muitas vezes na última hora. Tente de novo mais tarde.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const before = slides.map((s) => s.time);
    const [{ slideLeadSeconds }, learned] = await Promise.all([this.settings(tenantId), this.learned(tenantId)]);
    let output;
    try {
      output = await this.aligner.align({
        model: option.model,
        effort: this.ai.effort,
        instruction: dto.instruction,
        durationSeconds: song.audioDurationSeconds,
        leadSeconds: slideLeadSeconds,
        slides: slides.map((s) => ({
          index: s.index,
          part: parts[s.part]?.name ?? '',
          firstLine: (s.lines[0] ?? s.cues[0]?.text ?? '').slice(0, 80),
          time: s.time,
        })),
        learned,
      });
    } catch (error) {
      this.logger.warn(
        error instanceof SummarizerError
          ? `Ajuste de tempos por IA falhou: reason=${error.reason} status=${error.status ?? '-'} type=${error.type ?? '-'} model=${option.model}`
          : `Ajuste de tempos por IA falhou: ${error instanceof Error ? error.name : 'erro desconhecido'} model=${option.model}`,
      );
      throw providerError(error);
    }
    let times: (number | null)[];
    try {
      times = validateSuggestion(output.times, slides.length, song.audioDurationSeconds);
    } catch (error) {
      if (error instanceof SuggestionRejected) {
        throw new UnprocessableEntityException(`A sugestão da IA não fechou: ${error.message} Tente escrever de outro jeito.`);
      }
      throw error;
    }
    return { before, times, summary: output.summary, slideIds: slides.map((s) => s.rowId) };
  }
}
