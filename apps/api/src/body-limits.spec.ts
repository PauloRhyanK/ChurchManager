import assert from 'node:assert/strict';
import test from 'node:test';
import { Body, Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { applyBodyLimits } from './body-limits';

@Controller('echo')
class EchoController {
  @Post()
  echo(@Body() body: { text?: string }) {
    return { length: body?.text?.length ?? 0 };
  }
}

@Module({ controllers: [EchoController] })
class EchoModule {}

async function withApp(run: (url: string) => Promise<void>) {
  const app = await NestFactory.create<NestExpressApplication>(EchoModule, { logger: false });
  applyBodyLimits(app);
  await app.listen(0, '127.0.0.1');
  try {
    await run(await app.getUrl());
  } finally {
    await app.close();
  }
}

const post = (url: string, chars: number) =>
  fetch(`${url}/echo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'a'.repeat(chars) }),
  });

test('JSON de até 2 MB passa: uma palavra no limite do validador (300.000 caracteres) chega ao controller', async () => {
  await withApp(async (url) => {
    // 300.000 caracteres com acento ocupam uns 600 kB em UTF-8, bem acima dos 100 kB padrão do Nest.
    const res = await post(url, 600_000);
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { length: 600_000 });
  });
});

test('JSON acima de 2 MB dá 413', async () => {
  await withApp(async (url) => {
    const res = await post(url, 2_200_000);
    assert.equal(res.status, 413);
  });
});
