import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, WorshipSong } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SermonDeliveryService } from '../sermons/sermon-delivery.service';
import { computeSchedule } from './service-schedule';
import { WorshipRow, deriveSong, holyricsText, songStatus } from './worship-document';

export const PONTE_KEY_HEADER = 'x-ponte-key';
const KEY_PREFIX = 'ponte_';
/** A Ponte consulta a cada poucos segundos: não vale uma escrita por consulta. */
const LAST_USED_EVERY_MS = 5 * 60 * 1000;
const TIME_ZONE = 'America/Sao_Paulo';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const SERVICE_INCLUDE = {
  moments: { orderBy: { sortOrder: 'asc' } },
  songs: { orderBy: { sortOrder: 'asc' }, include: { song: { omit: { rawLyrics: true } } } },
} satisfies Prisma.WorshipServiceInclude;
type ServiceWithAll = Prisma.WorshipServiceGetPayload<{ include: typeof SERVICE_INCLUDE }>;

const rowsOf = (song: Pick<WorshipSong, 'rows'>): WorshipRow[] =>
  Array.isArray(song.rows) ? (song.rows as unknown as WorshipRow[]) : [];

/** Uma música no formato que a Ponte lê (seção "Contrato para a Ponte" da especificação). */
export function toPonteSong(song: Omit<WorshipSong, 'rawLyrics'>) {
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
    slides: slides.map((s) => ({ index: s.index, part: s.part, time: s.time, lines: s.lines, cues: s.cues })),
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
    return service ? this.payload(tenantId, service) : { version: 'vazio', service: null, sermon: null, songs: [] };
  }

  async serviceById(tenantId: string, id: string) {
    const service = await this.prisma.worshipService.findFirst({ where: { id, tenantId }, include: SERVICE_INCLUDE });
    if (!service) throw new NotFoundException('Culto não encontrado');
    return this.payload(tenantId, service);
  }

  private async payload(tenantId: string, service: ServiceWithAll) {
    const sermon = (await this.deliveries.summaries(tenantId, [service.id])).get(service.id) ?? null;
    const schedule = computeSchedule(
      service.startTime,
      service.moments.map((m) => ({ name: m.name, kind: m.kind, durationMinutes: m.durationMinutes })),
      service.songs.map((s) => s.song.audioDurationSeconds),
    );
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
      songs: service.songs.map((s) => toPonteSong(s.song)),
    };
    // Impressão digital do conteúdo: a Ponte só refaz o trabalho quando ela muda.
    const version = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 12);
    return { version, ...body };
  }
}
