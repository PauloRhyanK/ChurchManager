import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  InternalServerErrorException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MAX_IMAGE_BYTES, MAX_SLIDE_PNG_BYTES, StorageService, pngDimensions } from './storage.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOLDER = `tenants/${TENANT}/church`;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(32),
]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const FULL_ENV = {
  R2_ENDPOINT: 'https://acct123.r2.cloudflarestorage.com',
  R2_BUCKET_NAME: 'meu-bucket-secreto',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_PUBLIC_URL: 'https://cdn.exemplo.org/',
};

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  return async () => {
    const saved: Record<string, string | undefined> = {};
    for (const k of Object.keys(FULL_ENV)) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

function createService(send?: (cmd: { input: Record<string, unknown> }) => Promise<unknown>) {
  const sent: Array<Record<string, unknown>> = [];
  const service = new StorageService();
  (service as unknown as { s3Client: unknown }).s3Client = {
    send: async (cmd: { input: Record<string, unknown> }) => {
      sent.push(cmd.input);
      return send ? send(cmd) : {};
    },
  };
  return { service, sent };
}

test('aceita JPEG, PNG, WebP e GIF e grava o ContentType detectado', withEnv(FULL_ENV, async () => {
  const cases: Array<[Buffer, string, string]> = [
    [JPEG, 'image/jpeg', '.jpg'],
    [PNG, 'image/png', '.png'],
    [WEBP, 'image/webp', '.webp'],
    [GIF, 'image/gif', '.gif'],
  ];
  for (const [buf, type, ext] of cases) {
    const { service, sent } = createService();
    const url = await service.uploadImage(buf, FOLDER);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].ContentType, type);
    assert.ok((sent[0].Key as string).startsWith(`${FOLDER}/`));
    assert.ok((sent[0].Key as string).endsWith(ext));
    assert.ok(url.startsWith(`https://cdn.exemplo.org/${FOLDER}/`));
    assert.ok(!url.includes('//tenants'));
  }
}));

test('recusa SVG com 400 e não grava nada', withEnv(FULL_ENV, async () => {
  const { service, sent } = createService();
  await assert.rejects(() => service.uploadImage(SVG, FOLDER), BadRequestException);
  assert.equal(sent.length, 0);
}));

test('recusa conteúdo que não é imagem e arquivo ausente', withEnv(FULL_ENV, async () => {
  const { service, sent } = createService();
  await assert.rejects(() => service.uploadImage(Buffer.from('%PDF-1.4 hello'), FOLDER), BadRequestException);
  await assert.rejects(() => service.uploadImage(undefined, FOLDER), BadRequestException);
  assert.equal(sent.length, 0);
}));

test('arquivo maior que 5 MB resulta em 413', withEnv(FULL_ENV, async () => {
  const { service, sent } = createService();
  const big = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]);
  await assert.rejects(() => service.uploadImage(big, FOLDER), PayloadTooLargeException);
  assert.equal(sent.length, 0);
}));

test('configuração ausente: erro controlado e nenhum PutObject', withEnv({ ...FULL_ENV, R2_PUBLIC_URL: undefined }, async () => {
  const { service, sent } = createService();
  await assert.rejects(
    () => service.uploadImage(PNG, FOLDER),
    (e: unknown) => {
      assert.ok(e instanceof ServiceUnavailableException);
      const msg = JSON.stringify((e as ServiceUnavailableException).getResponse());
      assert.match(msg, /Armazenamento de imagens indisponível/);
      assert.ok(!/R2_|bucket|endpoint/i.test(msg));
      return true;
    },
  );
  assert.equal(sent.length, 0);
}));

test('erro do SDK não vaza bucket, endpoint nem variáveis', withEnv(FULL_ENV, async () => {
  const { service } = createService(async () => {
    throw Object.assign(
      new Error('NoSuchBucket meu-bucket-secreto at https://acct123.r2.cloudflarestorage.com R2_BUCKET_NAME'),
      { name: 'NoSuchBucket', $metadata: { httpStatusCode: 404, requestId: 'req-1' } },
    );
  });
  await assert.rejects(
    () => service.uploadImage(PNG, FOLDER),
    (e: unknown) => {
      assert.ok(e instanceof InternalServerErrorException);
      const msg = JSON.stringify((e as InternalServerErrorException).getResponse());
      assert.ok(!/bucket|endpoint|R2_|acct123|secreto/i.test(msg), msg);
      return true;
    },
  );
}));

test('falha no R2: o log do servidor traz a mensagem e a causa do erro, sem a chave secreta', withEnv(FULL_ENV, async () => {
  const { service } = createService(async () => {
    throw Object.assign(new TypeError('fetch failed (assinatura com secret)'), {
      cause: { code: 'ENOTFOUND', hostname: 'acct123.r2.cloudflarestorage.com' },
    });
  });
  const logged: string[] = [];
  (service as unknown as { logger: { error: (m: string) => void } }).logger = {
    error: (m: string) => logged.push(m),
  };
  await assert.rejects(() => service.uploadImage(PNG, FOLDER), InternalServerErrorException);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /TypeError/);
  assert.match(logged[0], /fetch failed/);
  assert.match(logged[0], /ENOTFOUND/);
  assert.ok(!logged[0].includes('secret)'), logged[0]);
}));

// --- áudio-guia das músicas ---------------------------------------------------

const pad = (head: Buffer) => Buffer.concat([head, Buffer.alloc(64)]);
const WAV = pad(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WAVEfmt ')]));
const MP3_ID3 = pad(Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'latin1'));
const MP3_FRAME = pad(Buffer.from([0xff, 0xfb, 0x90, 0x64]));
const OGG = pad(Buffer.from('OggS\x00\x02', 'latin1'));
const FLAC = pad(Buffer.from('fLaC\x00\x00\x00\x22', 'latin1'));
const M4A = pad(Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A ')]));
const AUDIO_FOLDER = `tenants/${TENANT}/worship/audio`;

test('áudio: aceita MP3, WAV, M4A, OGG e FLAC pela assinatura', withEnv(FULL_ENV, async () => {
  const cases: Array<[Buffer, string, string]> = [
    [WAV, 'audio/wav', '.wav'],
    [MP3_ID3, 'audio/mpeg', '.mp3'],
    [MP3_FRAME, 'audio/mpeg', '.mp3'],
    [OGG, 'audio/ogg', '.ogg'],
    [FLAC, 'audio/flac', '.flac'],
    [M4A, 'audio/mp4', '.m4a'],
  ];
  for (const [buf, type, ext] of cases) {
    const { service, sent } = createService();
    const out = await service.uploadAudio(buf, AUDIO_FOLDER);
    assert.equal(sent[0].ContentType, type);
    assert.ok((sent[0].Key as string).startsWith(`${AUDIO_FOLDER}/`));
    assert.ok((sent[0].Key as string).endsWith(ext));
    assert.equal(out.sizeBytes, buf.length);
    assert.ok(out.url.startsWith(`https://cdn.exemplo.org/${AUDIO_FOLDER}/`));
  }
}));

test('áudio: recusa o que não é áudio (imagem, WebP em RIFF, texto) e arquivo ausente', withEnv(FULL_ENV, async () => {
  const { service, sent } = createService();
  const UTF16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('texto qualquer', 'utf16le')]);
  const VIDEO = pad(Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypqt  ')]));
  for (const buf of [PNG, WEBP, SVG, UTF16, VIDEO, Buffer.from('isto não é um mp3, só tem a extensão')]) {
    await assert.rejects(() => service.uploadAudio(buf, AUDIO_FOLDER), BadRequestException);
  }
  await assert.rejects(() => service.uploadAudio(undefined, AUDIO_FOLDER), BadRequestException);
  assert.equal(sent.length, 0);
}));

test('áudio: acima de 90 MB resulta em 413 e nada é gravado', withEnv(FULL_ENV, async () => {
  const { service, sent } = createService();
  const big = Buffer.alloc(90 * 1024 * 1024 + 1);
  WAV.copy(big);
  await assert.rejects(() => service.uploadAudio(big, AUDIO_FOLDER), PayloadTooLargeException);
  assert.equal(sent.length, 0);
}));

/** PNG mínimo com IHDR de `w`×`h`. */
const pngOf = (w: number, h: number) => {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(w, 8);
  ihdr.writeUInt32BE(h, 12);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, Buffer.alloc(16)]);
};

test('pngDimensions lê largura e altura do IHDR; o que não é PNG dá null', () => {
  assert.deepEqual(pngDimensions(pngOf(1920, 1080)), { width: 1920, height: 1080 });
  assert.equal(pngDimensions(JPEG), null);
  assert.equal(pngDimensions(PNG), null); // assinatura sem IHDR
  assert.equal(pngDimensions(Buffer.alloc(0)), null);
});

test('uploadPng grava na chave exata, com image/png e cache longo', withEnv(FULL_ENV, async () => {
  const { service, sent } = createService();
  const key = `tenants/${TENANT}/sermons/d1/0123456789abcdef.png`;
  const url = await service.uploadPng(pngOf(1920, 1080), key);
  assert.equal(url, `https://cdn.exemplo.org/${key}`);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].Key, key);
  assert.equal(sent[0].ContentType, 'image/png');
  assert.equal(sent[0].CacheControl, 'public, max-age=31536000, immutable');
}));

test('uploadPng recusa o que não é PNG (400) e passa de 1,5 MB (413), sem gravar', withEnv(FULL_ENV, async () => {
  const { service, sent } = createService();
  await assert.rejects(() => service.uploadPng(JPEG, 'k.png'), BadRequestException);
  await assert.rejects(() => service.uploadPng(undefined, 'k.png'), BadRequestException);
  const big = Buffer.concat([pngOf(1920, 1080), Buffer.alloc(MAX_SLIDE_PNG_BYTES)]);
  await assert.rejects(() => service.uploadPng(big, 'k.png'), PayloadTooLargeException);
  assert.equal(sent.length, 0);
}));
