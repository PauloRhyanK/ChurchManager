import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { WorshipPonteService, toPonteSong } from './worship-ponte.service';
import type { WorshipRow } from './worship-document';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SERVICE_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

const ROWS: WorshipRow[] = [
  { id: 'a', type: 'cue', target: 'VOCAL', text: 'solo', part: { kind: 'VERSE', mood: 'WORSHIP' }, time: 14.2 },
  { id: 'b', type: 'lyric', text: 'Antes do sol nascer' },
  { id: 'c', type: 'lyric', text: 'És a luz da manhã', part: { kind: 'CHORUS', mood: 'CELEBRATION' }, time: 44 },
];
const SONG = {
  id: 's1', tenantId: TENANT_B, title: 'Luz da Manhã', artist: null, musicalKey: 'Sol', bpm: 72, timeSignature: '4/4',
  holyricsId: '1741522267781', rows: ROWS, status: 'READY', audioUrl: 'https://cdn/a.mp3', audioFileName: 'a.mp3',
  audioDurationSeconds: 252.4, audioSizeBytes: 10, readyAt: new Date('2026-11-20T10:00:00Z'),
  createdAt: new Date('2026-11-19T10:00:00Z'), updatedAt: new Date('2026-11-20T10:00:00Z'),
};

function build(options: { keys?: Record<string, string>; lastUsedAt?: Date | null } = {}) {
  const writes: string[] = [];
  const keys = new Map(Object.entries(options.keys ?? {}));
  const slugs: Record<string, string> = { a: TENANT_A, b: TENANT_B };
  const service = {
    id: SERVICE_B, tenantId: TENANT_B, date: new Date('2026-11-22T00:00:00.000Z'), startTime: '19:00', name: 'Domingo',
    templateId: null, updatedAt: new Date('2026-11-20T10:00:00Z'),
    moments: [
      { name: 'Louvor', kind: 'WORSHIP', durationMinutes: 17, sortOrder: 0 },
      { name: 'Palavra', kind: 'SERMON', durationMinutes: 40, sortOrder: 1 },
    ],
    songs: [{ id: 'e1', song: SONG }],
  };
  const keyRow = (tenantId: string) =>
    keys.has(tenantId)
      ? { id: `k-${tenantId}`, tenantId, keyHash: keys.get(tenantId), keyHint: 'abcd', createdAt: new Date(), lastUsedAt: options.lastUsedAt ?? null }
      : null;
  const prisma = {
    tenant: {
      findUnique: async ({ where }: { where: { slug?: string; id?: string } }) => {
        const id = where.id ?? slugs[where.slug ?? ''];
        return id ? { id, slug: where.slug ?? 'b', worshipPonteKey: keyRow(id) } : null;
      },
    },
    worshipPonteKey: {
      findUnique: async ({ where }: { where: { tenantId: string } }) => keyRow(where.tenantId),
      upsert: async ({ where, create }: { where: { tenantId: string }; create: { keyHash: string } }) => {
        writes.push('upsert');
        keys.set(where.tenantId, create.keyHash);
      },
      update: async () => {
        writes.push('lastUsed');
      },
      deleteMany: async ({ where }: { where: { tenantId: string } }) => {
        writes.push('delete');
        keys.delete(where.tenantId);
      },
    },
    worshipService: {
      findFirst: async ({ where }: { where: { tenantId: string; id?: string; date?: { gte: Date } } }) => {
        if (where.tenantId !== TENANT_B) return null;
        if (where.id && where.id !== SERVICE_B) return null;
        if (where.date && service.date < where.date.gte) return null;
        return service;
      },
    },
  };
  const deliveries = {
    summaries: async () => new Map([[SERVICE_B, { title: 'A luz', preacherName: 'Pr. João', estimatedMinutes: 35 }]]),
  };
  return { svc: new WorshipPonteService(prisma as never, deliveries as never), writes, keys };
}

test('gerar a chave: devolve a chave uma vez, guarda só o hash, e a anterior deixa de valer', async () => {
  const { svc, keys } = build();
  const first = await svc.generateKey(TENANT_B);
  assert.match(first.key, /^ponte_[A-Za-z0-9_-]{43}$/);
  assert.equal(keys.get(TENANT_B), sha(first.key));
  assert.equal(first.active, true);
  assert.equal(first.path, '/public/tenants/b/worship/services/next');
  assert.equal(await svc.authorize('b', first.key), TENANT_B);

  const second = await svc.generateKey(TENANT_B);
  assert.notEqual(second.key, first.key);
  await assert.rejects(svc.authorize('b', first.key), UnauthorizedException);
  assert.equal(JSON.stringify(await svc.keyStatus(TENANT_B)).includes(second.key), false, 'a situação nunca devolve a chave');
});

test('chave errada, ausente, de outra igreja, revogada ou igreja inexistente: sempre 401', async () => {
  const key = 'ponte_' + 'x'.repeat(43);
  const { svc } = build({ keys: { [TENANT_B]: sha(key) } });
  for (const [slug, received] of [
    ['b', undefined],
    ['b', ''],
    ['b', 'ponte_' + 'y'.repeat(43)],
    ['b', key.slice(6)],
    ['b', ['a', 'b']],
    ['b', key + 'x'.repeat(300)],
    ['a', key],
    ['nao-existe', key],
  ] as const) {
    await assert.rejects(svc.authorize(slug, received), UnauthorizedException);
  }
  assert.equal(await svc.authorize('b', key), TENANT_B);
  await svc.revokeKey(TENANT_B);
  await assert.rejects(svc.authorize('b', key), UnauthorizedException);
});

test('"último acesso" não é regravado a cada consulta', async () => {
  const key = 'ponte_' + 'x'.repeat(43);
  const recent = build({ keys: { [TENANT_B]: sha(key) }, lastUsedAt: new Date() });
  await recent.svc.authorize('b', key);
  assert.deepEqual(recent.writes, []);
  const old = build({ keys: { [TENANT_B]: sha(key) }, lastUsedAt: new Date(Date.now() - 10 * 60 * 1000) });
  await old.svc.authorize('b', key);
  assert.deepEqual(old.writes, ['lastUsed']);
});

test('próximo culto: formato do contrato, com versão estável', async () => {
  const { svc } = build();
  const out = await svc.nextService(TENANT_B, new Date('2026-11-22T21:00:00Z'));
  assert.equal(out.service?.date, '2026-11-22');
  assert.deepEqual(out.service?.moments, [
    { name: 'Louvor', kind: 'WORSHIP', startsAt: '19:00', durationMinutes: 5 },
    { name: 'Palavra', kind: 'SERMON', startsAt: '19:05', durationMinutes: 40 },
  ]);
  assert.deepEqual(out.sermon, { title: 'A luz', preacherName: 'Pr. João', estimatedMinutes: 35 });
  const song = out.songs[0];
  assert.equal(song.status, 'READY');
  assert.equal(song.holyricsId, '1741522267781');
  assert.deepEqual(song.audio, { url: 'https://cdn/a.mp3', fileName: 'a.mp3', durationSeconds: 252.4, sizeBytes: 10 });
  assert.deepEqual(song.parts, [
    { index: 0, kind: 'VERSE', name: 'Verso 1', mood: 'WORSHIP', time: 14.2, firstSlide: 0, slideCount: 1 },
    { index: 1, kind: 'CHORUS', name: 'Refrão', mood: 'CELEBRATION', time: 44, firstSlide: 1, slideCount: 1 },
  ]);
  assert.deepEqual(song.slides[0], {
    index: 0, part: 0, time: 14.2, lines: ['ANTES DO SOL NASCER'], cues: [{ target: 'VOCAL', text: 'solo' }],
  });
  assert.equal(song.holyricsText, '//Vocal: solo\nANTES DO SOL NASCER\n\nÉS A LUZ DA MANHÃ');
  assert.equal('rows' in song, false);
  assert.equal('rawLyrics' in song, false);
  assert.equal('tenantId' in song, false);
  assert.match(out.version, /^[0-9a-f]{12}$/);
  assert.equal((await svc.nextService(TENANT_B, new Date('2026-11-22T21:00:00Z'))).version, out.version);
});

test('"hoje" é o dia em São Paulo: às 23h de domingo o culto de domingo ainda é o próximo', async () => {
  const { svc } = build();
  // 02:30 UTC de segunda = 23:30 de domingo em São Paulo.
  assert.equal((await svc.nextService(TENANT_B, new Date('2026-11-23T02:30:00Z'))).service?.id, SERVICE_B);
  const depois = await svc.nextService(TENANT_B, new Date('2026-11-23T12:00:00Z'));
  assert.deepEqual(depois, { version: 'vazio', service: null, sermon: null, songs: [] });
});

test('culto por id: de outra igreja responde 404', async () => {
  const { svc } = build();
  assert.equal((await svc.serviceById(TENANT_B, SERVICE_B)).service.id, SERVICE_B);
  await assert.rejects(svc.serviceById(TENANT_A, SERVICE_B), NotFoundException);
});

test('música que não está pronta vai com o que tiver (tempo nulo onde falta)', () => {
  const rows = ROWS.map((r) => (r.id === 'c' ? { ...r, time: null } : r));
  const out = toPonteSong({ ...SONG, rows, readyAt: null, holyricsId: null } as never);
  assert.equal(out.status, 'NEEDS_TIMING');
  assert.equal(out.slides[1].time, null);
  assert.equal(out.parts[1].time, null);
  assert.equal(out.holyricsId, null);
});
