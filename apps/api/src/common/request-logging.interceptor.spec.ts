import assert from 'node:assert/strict';
import test from 'node:test';
import { lastValueFrom, of } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

/** Roda o interceptor num pedido e devolve o que foi para o console. */
async function logsFor(req: { method: string; originalUrl: string; body?: unknown }): Promise<unknown[][]> {
  const lines: unknown[][] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args);
  try {
    const context = { switchToHttp: () => ({ getRequest: () => req }) } as never;
    await lastValueFrom(new RequestLoggingInterceptor().intercept(context, { handle: () => of({ ok: true }) }));
  } finally {
    console.log = original;
  }
  return lines;
}

test('rotas de palavras não logam o corpo (título e documento ficam fora do log)', async () => {
  const lines = await logsFor({
    method: 'PUT',
    originalUrl: '/api/admin/tenants/me/sermons/11111111-1111-4111-8111-111111111111',
    body: { title: 'Segredo do pregador', document: { type: 'doc', content: [] } },
  });
  const text = JSON.stringify(lines);
  assert.equal(text.includes('Segredo do pregador'), false);
  assert.equal(text.includes('"document"'), false);
  const request = lines.find((l) => l[0] === '[HTTP] request')![1] as Record<string, unknown>;
  assert.equal(request.method, 'PUT');
  assert.equal(request.url, '/api/admin/tenants/me/sermons/11111111-1111-4111-8111-111111111111');
  assert.equal('body' in request, false);
  assert.ok(lines.some((l) => l[0] === '[HTTP] response'));
});

test('as outras rotas continuam logando o corpo, com segredos ocultos', async () => {
  const lines = await logsFor({
    method: 'POST',
    originalUrl: '/api/admin/tenants/me/ministries',
    body: { name: 'Louvor', password: 'x' },
  });
  const request = lines.find((l) => l[0] === '[HTTP] request')![1] as Record<string, unknown>;
  assert.deepEqual(request.body, { name: 'Louvor', password: '[REDACTED]' });
});
