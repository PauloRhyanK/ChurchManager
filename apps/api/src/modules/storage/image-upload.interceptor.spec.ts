import assert from 'node:assert/strict';
import test from 'node:test';
import { Controller, Module, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ImageUploadInterceptor } from './image-upload.interceptor';
import { MAX_IMAGE_BYTES } from './storage.service';

@Controller('t')
class TestController {
  @Post()
  @UseInterceptors(ImageUploadInterceptor)
  up(@UploadedFile() file: Express.Multer.File) {
    return { size: file.size };
  }
}

@Module({ controllers: [TestController] })
class TestModule {}

async function post(app: NestExpressApplication, size: number) {
  const url = await app.getUrl();
  const form = new FormData();
  form.append('file', new Blob([Buffer.alloc(size)]), 'a.png');
  const res = await fetch(`${url}/t`, { method: 'POST', body: form });
  return { status: res.status, body: await res.json() };
}

test('multipart acima de 5 MB responde 413 em pt-BR; dentro do limite passa', async () => {
  const app = await NestFactory.create<NestExpressApplication>(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  try {
    const big = await post(app, MAX_IMAGE_BYTES + 1);
    assert.equal(big.status, 413);
    assert.equal(big.body.message, 'A imagem excede o limite de 5 MB.');
    const ok = await post(app, 1024);
    assert.equal(ok.status, 201);
  } finally {
    await app.close();
  }
});
