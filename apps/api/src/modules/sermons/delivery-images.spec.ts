import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { MAX_SLIDE_PNG_BYTES } from '../storage/storage.service';
import { readDeliverySlides } from './delivery-copy';
import { RENDER_VERSION, deliveryVersion, slideHash } from './delivery-images';
import { SermonDeliveryImagesService } from './delivery-images.service';
import { EXAMPLE_DOC } from './sermon-example';
import { buildSlides, publicSlides, type PublicSlide } from './sermon-slides';
import { SermonDeliveryService } from './sermon-delivery.service';
import { SermonsService } from './sermons.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AUTHOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const SV = '33333333-3333-4333-8333-333333333331';
const D1 = 'eeeeeeee-eeee-4eee-8eee-000000000001';
const CDN = 'https://cdn.exemplo.org';

const user = (over: Partial<AuthUser> = {}) =>
  ({ userId: AUTHOR, tenantId: TENANT, email: 'p@x.com', role: 'MEMBER', ...over }) as AuthUser;

type Row = Record<string, any>;

const SLIDES = () => publicSlides(buildSlides('Luz', EXAMPLE_DOC, 'VERSES_AND_POINTS'));
const urlOf = (hash: string, deliveryId = D1) => `${CDN}/tenants/${TENANT}/sermons/${deliveryId}/${hash}.png`;

/** PNG mínimo com IHDR de `w`×`h`. */
const png = (w = 1920, h = 1080, extra = 16) => {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(w, 8);
  ihdr.writeUInt32BE(h, 12);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, Buffer.alloc(extra)]);
};

function build(init: { deliveries?: Row[]; sermons?: Row[]; deleteFails?: boolean } = {}) {
  const sermons = init.sermons ?? [{ id: S1, tenantId: TENANT, authorId: AUTHOR, title: 'Luz' }];
  const deliveries: Row[] = (
    init.deliveries ?? [
      {
        id: D1, tenantId: TENANT, sermonId: S1, authorId: AUTHOR, serviceId: SV, title: 'Luz', preacherName: 'Pr. Paulo',
        estimatedSeconds: 601, slideStyle: 'MINIMAL', slides: SLIDES(), slideImages: {},
      },
    ]
  ).map((x) => ({ ...x }));
  const raw: { sql: string; values: unknown[] }[] = [];
  const uploads: string[] = [];
  const removed: string[] = [];
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const prisma = {
    sermon: {
      findFirst: async ({ where }: Row) => {
        const s = sermons.find((r) => matches(r, where));
        if (!s) return null;
        const delivery = deliveries.find((x) => x.sermonId === s.id) ?? null;
        return { ...s, delivery: delivery ? { ...delivery, slideImages: { ...delivery.slideImages }, service: null } : null };
      },
    },
    sermonDelivery: {
      findFirst: async ({ where }: Row) => deliveries.find((x) => matches(x, where)) ?? null,
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      raw.push({ sql, values });
      if (sql.includes('||')) {
        const [hash, url, id, tenantId] = values as string[];
        const row = deliveries.find((x) => x.id === id && x.tenantId === tenantId);
        if (row) row.slideImages = { ...row.slideImages, [hash]: url };
        return row ? 1 : 0;
      }
      const [stale, id, tenantId] = values as [string[], string, string];
      const row = deliveries.find((x) => x.id === id && x.tenantId === tenantId);
      if (row) for (const h of stale) delete row.slideImages[h];
      return row ? 1 : 0;
    },
  };
  const storage = {
    uploadPng: async (_buf: Buffer, key: string) => {
      uploads.push(key);
      return `${CDN}/${key}`;
    },
    deleteFileByPublicUrl: async (url: string) => {
      if (init.deleteFails) throw new Error('R2 fora do ar');
      removed.push(url);
    },
  };
  const sermonsService = new SermonsService(prisma as never);
  const images = new SermonDeliveryImagesService(prisma as never, sermonsService, storage as never);
  const ponte = new SermonDeliveryService(prisma as never, sermonsService);
  return { images, ponte, deliveries, raw, uploads, removed };
}

test('hash do slide: estável, 16 hex, e muda com o texto, a referência e o estilo', () => {
  const slides = readDeliverySlides(SLIDES());
  const verse = slides.find((s) => s.kind === 'VERSE')!;
  const h = slideHash('MINIMAL', verse);
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(slideHash('MINIMAL', { ...verse }), h);
  assert.equal(RENDER_VERSION, 'painel-1');
  assert.notEqual(slideHash('MINIMAL', { ...verse, verse: `${verse.verse} amém` }), h);
  assert.notEqual(slideHash('MINIMAL', { ...verse, reference: 'João 8:13' }), h);
  assert.notEqual(slideHash('BACKGROUND', verse), h);
  assert.notEqual(slideHash('MINIMAL', { ...verse, title: 'Outro título' }), h);
});

test('versão do envio: muda quando um slide muda, o estilo ou o título', () => {
  const slides = readDeliverySlides(SLIDES());
  const hashes = slides.map((s) => slideHash('MINIMAL', s));
  const v = deliveryVersion('MINIMAL', 'Luz', hashes);
  assert.match(v, /^[0-9a-f]{16}$/);
  assert.equal(deliveryVersion('MINIMAL', 'Luz', [...hashes]), v);
  const changed: PublicSlide = { ...slides[0], title: 'Mudou' };
  assert.notEqual(deliveryVersion('MINIMAL', 'Luz', [slideHash('MINIMAL', changed), ...hashes.slice(1)]), v);
  assert.notEqual(deliveryVersion('BACKGROUND', 'Luz', hashes), v);
  assert.notEqual(deliveryVersion('MINIMAL', 'Outra', hashes), v);
});

test('GET devolve estilo, versão e cada slide com hash, o slide entregue e imageUrl', async () => {
  const { images, deliveries } = build();
  const slides = readDeliverySlides(deliveries[0].slides);
  const first = slideHash('MINIMAL', slides[0]);
  deliveries[0].slideImages = { [first]: urlOf(first) };
  const out = await images.list(user(), S1);
  assert.equal(out.style, 'MINIMAL');
  assert.equal(out.version, deliveryVersion('MINIMAL', 'Luz', slides.map((s) => slideHash('MINIMAL', s))));
  assert.equal(out.slides.length, slides.length);
  assert.deepEqual(out.slides[0], { index: 0, hash: first, slide: slides[0], imageUrl: urlOf(first) });
  assert.equal(out.slides[1].imageUrl, null);
  assert.deepEqual(Object.keys(out.slides[1]).sort(), ['hash', 'imageUrl', 'index', 'slide']);
});

test('GET limpa o mapa: tira os hashes que não estão nos slides e apaga do R2', async () => {
  const { images, deliveries, raw, removed } = build();
  const current = slideHash('MINIMAL', readDeliverySlides(deliveries[0].slides)[0]);
  const stale = 'ffffffffffffffff';
  deliveries[0].slideImages = { [current]: urlOf(current), [stale]: urlOf(stale) };
  await images.list(user(), S1);
  assert.deepEqual(deliveries[0].slideImages, { [current]: urlOf(current) });
  assert.deepEqual(removed, [urlOf(stale)]);
  assert.match(raw[0].sql, /slide_images - \?::text\[\] WHERE id = \?::uuid AND tenant_id = \?::uuid/);
  assert.deepEqual(raw[0].values, [[stale], D1, TENANT]);
  // Nada a limpar: nenhuma escrita.
  await images.list(user(), S1);
  assert.equal(raw.length, 1);
});

test('GET: falha ao apagar no R2 não derruba a resposta', async () => {
  const { images, deliveries } = build({ deleteFails: true });
  deliveries[0].slideImages = { ffffffffffffffff: urlOf('ffffffffffffffff') };
  const out = await images.list(user(), S1);
  assert.ok(out.slides.length > 0);
});

test('GET e PUT respeitam autor e tenant; palavra sem envio dá 404', async () => {
  const { images, raw, uploads } = build({
    sermons: [
      { id: S1, tenantId: TENANT, authorId: AUTHOR, title: 'Luz' },
      { id: S2, tenantId: TENANT, authorId: AUTHOR, title: 'Sem envio' },
    ],
  });
  const hash = (await images.list(user(), S1)).slides[0].hash;
  await assert.rejects(images.list(user({ userId: OTHER }), S1), NotFoundException);
  await assert.rejects(images.list(user({ tenantId: OTHER_TENANT }), S1), NotFoundException);
  await assert.rejects(images.list(user(), S2), NotFoundException);
  await assert.rejects(images.upload(user({ userId: OTHER }), S1, hash, { buffer: png() }), NotFoundException);
  await assert.rejects(images.upload(user({ tenantId: OTHER_TENANT }), S1, hash, { buffer: png() }), NotFoundException);
  await assert.rejects(images.upload(user(), S2, hash, { buffer: png() }), NotFoundException);
  assert.deepEqual(uploads, []);
  assert.equal(raw.length, 0);
});

test('PUT recusa hash fora do formato ou fora dos slides, não-PNG, IHDR errado e acima de 1,5 MB', async () => {
  const { images, uploads, raw } = build();
  const hash = (await images.list(user(), S1)).slides[0].hash;
  const changed = (e: unknown) =>
    e instanceof BadRequestException && (e.getResponse() as { message: string }).message === 'A lista de slides mudou. Atualize a página.';
  await assert.rejects(images.upload(user(), S1, '../../x', { buffer: png() }), changed);
  await assert.rejects(images.upload(user(), S1, hash.toUpperCase(), { buffer: png() }), changed);
  await assert.rejects(images.upload(user(), S1, 'ffffffffffffffff', { buffer: png() }), changed);
  await assert.rejects(images.upload(user(), S1, hash, { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) }), BadRequestException);
  await assert.rejects(images.upload(user(), S1, hash, { buffer: png(1280, 720) }), BadRequestException);
  await assert.rejects(images.upload(user(), S1, hash, undefined), BadRequestException);
  await assert.rejects(images.upload(user(), S1, hash, { buffer: png(1920, 1080, MAX_SLIDE_PNG_BYTES) }), PayloadTooLargeException);
  assert.deepEqual(uploads, []);
  assert.equal(raw.length, 0);
});

test('PUT grava na chave do hash e acrescenta ao mapa de forma atômica, com o tenant', async () => {
  const { images, deliveries, uploads, raw } = build();
  const hash = (await images.list(user(), S1)).slides[1].hash;
  const out = await images.upload(user(), S1, hash, { buffer: png() });
  assert.deepEqual(out, { hash, imageUrl: urlOf(hash) });
  assert.deepEqual(uploads, [`tenants/${TENANT}/sermons/${D1}/${hash}.png`]);
  assert.match(raw[0].sql, /slide_images = slide_images \|\| jsonb_build_object\(\?::text, \?::text\) WHERE id = \?::uuid AND tenant_id = \?::uuid/);
  assert.deepEqual(raw[0].values, [hash, urlOf(hash), D1, TENANT]);
  assert.deepEqual(deliveries[0].slideImages, { [hash]: urlOf(hash) });
  assert.equal((await images.list(user(), S1)).slides[1].imageUrl, urlOf(hash));
});

test('forPonte: campos de sempre, versão e imageUrl só para os hashes atuais', async () => {
  const { ponte, deliveries } = build();
  const slides = readDeliverySlides(deliveries[0].slides);
  const first = slideHash('MINIMAL', slides[0]);
  deliveries[0].slideImages = { [first]: urlOf(first), ffffffffffffffff: urlOf('ffffffffffffffff') };
  const out = (await ponte.forPonte(TENANT, SV))!;
  assert.equal(out.title, 'Luz');
  assert.equal(out.preacherName, 'Pr. Paulo');
  assert.equal(out.estimatedMinutes, 11);
  assert.equal(out.slideCount, slides.length);
  assert.equal(out.version, deliveryVersion('MINIMAL', 'Luz', slides.map((s) => slideHash('MINIMAL', s))));
  assert.deepEqual(out.slides[0], {
    index: 0, kind: slides[0].kind, title: slides[0].title, text: slides[0].text, reference: slides[0].reference,
    imageUrl: urlOf(first), width: 1920, height: 1080,
  });
  assert.equal(out.slides.filter((s) => s.imageUrl).length, 1, 'o hash antigo do mapa não aparece');
  for (const s of out.slides.slice(1)) {
    assert.equal(s.imageUrl, null);
    assert.equal(s.width, null);
    assert.equal(s.height, null);
  }
  assert.equal(await ponte.forPonte(OTHER_TENANT, SV), null);
  assert.equal(await ponte.forPonte(TENANT, 'outro'), null);
});

test('forPonte: entrega antiga (sem mapa e sem os campos de slideFace) vai com imageUrl null', async () => {
  const { ponte } = build({
    deliveries: [
      {
        id: D1, tenantId: TENANT, sermonId: S1, authorId: AUTHOR, serviceId: SV, title: 'Antiga', preacherName: 'Pr',
        estimatedSeconds: 60, slideStyle: 'MINIMAL', slides: [{ kind: 'VERSE', text: 'Eu sou a luz', reference: 'João 8:12' }],
        slideImages: undefined,
      },
    ],
  });
  const out = (await ponte.forPonte(TENANT, SV))!;
  assert.equal(out.slideCount, 1);
  assert.deepEqual(out.slides, [
    { index: 0, kind: 'VERSE', title: 'João 8:12', text: 'Eu sou a luz', reference: 'João 8:12', imageUrl: null, width: null, height: null },
  ]);
});

test('fluxo de atualização: o slide muda, o hash muda, a imagem antiga sai e a nova é pedida', async () => {
  const { images, ponte, deliveries, removed } = build();
  const before = await images.list(user(), S1);
  const old = before.slides[0].hash;
  await images.upload(user(), S1, old, { buffer: png() });
  assert.equal((await ponte.forPonte(TENANT, SV))!.slides[0].imageUrl, urlOf(old));

  // O pregador edita o primeiro slide: a cópia entregue muda (syncDeliveryCopy).
  deliveries[0].slides = deliveries[0].slides.map((s: Row, i: number) => (i === 0 ? { ...s, text: `${s.text} (editado)` } : s));
  const ponteNow = (await ponte.forPonte(TENANT, SV))!;
  assert.equal(ponteNow.slides[0].imageUrl, null, 'a Ponte cai para o texto até a nova imagem chegar');
  assert.notEqual(ponteNow.version, before.version);

  const after = await images.list(user(), S1);
  assert.notEqual(after.slides[0].hash, old);
  assert.equal(after.slides[0].imageUrl, null, 'a nova imagem é pedida');
  assert.deepEqual(removed, [urlOf(old)]);
  assert.deepEqual(deliveries[0].slideImages, {});
  await assert.rejects(images.upload(user(), S1, old, { buffer: png() }), BadRequestException);
});
