import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Sentry from '@sentry/nestjs';
import type { ErrorEvent } from '@sentry/nestjs';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import {
  BadRequestException,
  Controller,
  Get,
  Module,
  Post,
} from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { buildSentryOptions } from './sentry-options';

// Captura em memória: nenhum evento sai da máquina.
const sent: ErrorEvent[] = [];
const options = buildSentryOptions({
  SENTRY_DSN: 'https://chave@erros.exemplo.test/2',
  RELEASE_ID: 'teste',
});
assert.ok(options);
Sentry.init({
  ...options,
  beforeSend: (event, hint) => {
    const scrubbed = options.beforeSend!(event, hint) as ErrorEvent;
    sent.push(scrubbed);
    return null;
  },
});

@Controller()
class BoomController {
  @Post('boom')
  boom(): never {
    throw new Error('falhou para joao@x.com tel (27) 99999-8888');
  }

  @Get('bad')
  bad(): never {
    throw new BadRequestException('campo inválido');
  }
}

@Module({
  imports: [SentryModule.forRoot()],
  controllers: [BoomController],
  providers: [{ provide: APP_FILTER, useClass: SentryGlobalFilter }],
})
class BoomModule {}

test('erro inesperado vai ao GlitchTip limpo; HttpException não vai', async () => {
  const app = await NestFactory.create(BoomModule, { logger: false });
  await app.listen(0);
  const base = await app.getUrl();
  try {
    const res = await fetch(`${base}/boom?email=joao@x.com`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer segredo',
        cookie: 'sid=segredo',
      },
      body: JSON.stringify({ email: 'joao@x.com' }),
    });
    assert.equal(res.status, 500);
    assert.equal((await fetch(`${base}/bad`)).status, 400);
    await Sentry.flush(2000);

    assert.equal(sent.length, 1);
    const [event] = sent;
    assert.equal(event.release, 'teste');
    assert.equal(event.user, undefined);
    assert.equal(event.request?.url?.includes('?'), false);
    const json = JSON.stringify(event);
    assert.doesNotMatch(json, /joao@x\.com|99999-8888|segredo/);
    assert.match(json, /falhou para \[email\] tel \[telefone\]/);
  } finally {
    await app.close();
  }
});
