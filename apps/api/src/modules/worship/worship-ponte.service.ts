import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, WorshipSong } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SermonDeliveryService } from '../sermons/sermon-delivery.service';
import { songMood, songParts } from './roteiro';
import { computeSchedule } from './service-schedule';
import { LEAD_LIMITS } from './timing-learning';
import { WorshipRow, deriveSong, holyricsText, songStatus } from './worship-document';

export const PONTE_KEY_HEADER = 'x-ponte-key';
const KEY_PREFIX = 'ponte_';
/** A Ponte consulta a cada poucos segundos: não vale uma escrita por consulta. */
const LAST_USED_EVERY_MS = 5 * 60 * 1000;
const TIME_ZONE = 'America/Sao_Paulo';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const SERVICE_INCLUDE = {
  moments: { orderBy: { sortOrder: 'asc' }, include: { song: { omit: { rawLyrics: true } } } },
} satisfies Prisma.WorshipServiceInclude;
type ServiceWithAll = Prisma.WorshipServiceGetPayload<{ include: typeof SERVICE_INCLUDE }>;

const rowsOf = (song: Pick<WorshipSong, 'rows'>): WorshipRow[] =>
  Array.isArray(song.rows) ? (song.rows as unknown as WorshipRow[]) : [];

/**
 * Uma música no formato que a Ponte lê (seção "Contrato para a Ponte" da especificação).
 * O tempo de cada slide já vem com a antecipação descontada (`slideLeadSeconds`): é
 * quando ele deve aparecer. `markedTime` é o que foi marcado (início da frase).
 */
export function toPonteSong(song: Omit<WorshipSong, 'rawLyrics'>, slideLeadSeconds = 0) {
  const rows = rowsOf(song);
  const { parts, slides } = deriveSong(rows);
  const { status } = songStatus(rows, { url: song.audioUrl, durationSeconds: song.audioDurationSeconds }, song.readyAt);
  return {
    id: song.id,
    title: song.title,
    status,
    updatedAt: song.updatedAt,
    musicalKey: song.musicalKey,
    bpm: song.bpm,
    timeSignature: song.timeSignature,
    holyricsId: song.holyricsId,
    audio: song.audioUrl
      ? {
          url: song.audioUrl,
          fileName: song.audioFileName,
          durationSeconds: song.audioDurationSeconds,
          sizeBytes: song.audioSizeBytes,
        }
      : null,
    parts: parts.map((p) => ({
      index: p.index,
      kind: p.kind,
      name: p.name,
      mood: p.mood,
      time: p.time,
      firstSlide: p.firstSlide,
      slideCount: p.slideCount,
    })),
    slideLeadSeconds,
    slides: slides.map((s) => ({
      index: s.index,
      part: s.part,
      time: s.time === null ? null : Math.max(0, Math.round((s.time - slideLeadSeconds) * 100) / 100),
      markedTime: s.time,
      lines: s.lines,
      cues: s.cues,
    })),
    holyricsText: holyricsText(rows),
  };
}

@Injectable()
export class WorshipPonteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveries: SermonDeliveryService,
  ) {}

  // --- a chave (painel) ---------------------------------------------------------

  async keyStatus(tenantId: string) {
    const key = await this.prisma.worshipPonteKey.findUnique({ where: { tenantId } });
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    return {
      active: !!key,
      hint: key?.keyHint ?? null,
      createdAt: key?.createdAt ?? null,
      lastUsedAt: key?.lastUsedAt ?? null,
      /** Caminho que a Ponte consulta, relativo à base da API. */
      path: `/public/tenants/${tenant?.slug ?? ''}/worship/services/next`,
    };
  }

  /** Gera uma chave nova (a anterior deixa de valer). A chave só aparece nesta resposta. */
  async generateKey(tenantId: string) {
    const key = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
    const data = { keyHash: sha256(key), keyHint: key.slice(-4), createdAt: new Date(), lastUsedAt: null };
    await this.prisma.worshipPonteKey.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
    return { key, ...(await this.keyStatus(tenantId)) };
  }

  async revokeKey(tenantId: string) {
    await this.prisma.worshipPonteKey.deleteMany({ where: { tenantId } });
    return this.keyStatus(tenantId);
  }

  // --- a leitura (Ponte) --------------------------------------------------------

  /**
   * Confere a chave da igreja do `slug` e devolve o tenant. Igreja inexistente,
   * sem chave ou com chave errada respondem o mesmo 401.
   */
  async authorize(slug: string, received: unknown): Promise<string> {
    const denied = new UnauthorizedException('Chave da Ponte inválida');
    if (typeof received !== 'string' || !received.startsWith(KEY_PREFIX) || received.length > 200) throw denied;
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, worshipPonteKey: true },
    });
    const stored = tenant?.worshipPonteKey;
    // Compara sempre, mesmo sem chave guardada, para o tempo de resposta não denunciar.
    const expected = Buffer.from(stored?.keyHash ?? sha256(''), 'hex');
    const matches = timingSafeEqual(Buffer.from(sha256(received), 'hex'), expected);
    if (!tenant || !stored || !matches) throw denied;
    if (!stored.lastUsedAt || Date.now() - stored.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
      await this.prisma.worshipPonteKey.update({ where: { id: stored.id }, data: { lastUsedAt: new Date() } });
    }
    return tenant.id;
  }

  /** O próximo culto: o primeiro de hoje em diante, no fuso da igreja. `service: null` se não houver. */
  async nextService(tenantId: string, now = new Date()) {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE }).format(now);
    const service = await this.prisma.worshipService.findFirst({
      where: { tenantId, date: { gte: new Date(`${today}T00:00:00.000Z`) } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      include: SERVICE_INCLUDE,
    });
    return service ? this.payload(tenantId, service) : { version: 'vazio', service: null, sermon: null, songs: [], roteiro: [] };
  }

  async serviceById(tenantId: string, id: string) {
    const service = await this.prisma.worshipService.findFirst({ where: { id, tenantId }, include: SERVICE_INCLUDE });
    if (!service) throw new NotFoundException('Culto não encontrado');
    return this.payload(tenantId, service);
  }

  private async payload(tenantId: string, service: ServiceWithAll) {
    // Os campos de sempre (title, preacherName, estimatedMinutes, slideCount) e, desde 25/11/2026,
    // `version` e `slides` com as imagens. Contrato em docs/api/ponte-palavra.md.
    const sermon = await this.deliveries.forPonte(tenantId, service.id);
    const settings = await this.prisma.worshipSettings.findUnique({ where: { tenantId } });
    const lead = settings?.slideLeadSeconds ?? LEAD_LIMITS.default;
    const schedule = computeSchedule(
      service.startTime,
      service.moments.map((m) => ({
        id: m.id,
        name: m.song?.title ?? m.name,
        kind: m.kind,
        durationMinutes: m.durationMinutes,
        songSeconds: m.song?.audioDurationSeconds ?? null,
        song: m.song,
      })),
    );
    const songs = service.moments.flatMap((m) => (m.song ? [m.song] : []));
    const body = {
      service: {
        id: service.id,
        date: service.date.toISOString().slice(0, 10),
        startTime: service.startTime,
        name: service.name,
        updatedAt: service.updatedAt,
        endsAt: schedule.endsAt,
        moments: schedule.moments.map((m) => ({
          name: m.name,
          kind: m.kind,
          startsAt: m.startsAt,
          durationMinutes: m.effectiveMinutes,
        })),
      },
      sermon,
      songs: songs.map((song) => toPonteSong(song, lead)),
      // Acrescentado em 24/11/2026: o culto inteiro na ordem, momentos e músicas
      // intercalados. Contrato em docs/api/ponte-roteiro.md.
      roteiro: schedule.moments.map((m, i) => ({
        ordem: i + 1,
        tipo: m.kind === 'SONG' ? ('musica' as const) : ('momento' as const),
        id: m.id,
        nome: m.name,
        inicio: m.startsAt,
        duracaoMin: m.effectiveMinutes,
        ...(m.kind === 'SONG'
          ? {
              musica: m.song
                ? {
                    id: m.song.id,
                    titulo: m.song.title,
                    tom: m.song.musicalKey,
                    bpm: m.song.bpm,
                    clima: songMood(rowsOf(m.song)),
                    holyricsId: m.song.holyricsId,
                    audioUrl: m.song.audioUrl,
                    duracaoSeg: m.song.audioDurationSeconds,
                    partes: songParts(rowsOf(m.song), m.song.audioDurationSeconds),
                  }
                : null,
            }
          : {
              momento: {
                kind: m.kind,
                ...(m.kind === 'SERMON'
                  ? { palavra: sermon ? { titulo: sermon.title, pregador: sermon.preacherName } : null }
                  : {}),
              },
            }),
      })),
    };
    // Impressão digital do conteúdo: a Ponte só refaz o trabalho quando ela muda.
    const version = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 12);
    return { version, ...body };
  }
}
