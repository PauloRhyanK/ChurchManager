import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  InternalServerErrorException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MAX_IMAGE_BYTES, StorageService } from './storage.service';

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
