import assert from 'node:assert/strict';
import test from 'node:test';
import type { Breadcrumb, ErrorEvent } from '@sentry/nestjs';
import {
  buildSentryOptions,
  scrubBreadcrumb,
  scrubEvent,
  scrubText,
} from './sentry-options';

const DSN = 'https://chave@erros.exemplo.test/2';

test('sem SENTRY_DSN (ausente, vazio ou só espaços) não liga o SDK', () => {
  for (const value of [undefined, '', '   ']) {
    assert.equal(buildSentryOptions({ SENTRY_DSN: value }), null);
  }
});

test('com SENTRY_DSN: release do RELEASE_ID, ambiente e nada de PII/sessões/tracing', () => {
  const options = buildSentryOptions({
    SENTRY_DSN: ` ${DSN} `,
    RELEASE_ID: 'abc123',
    SENTRY_ENVIRONMENT: 'qa',
    NODE_ENV: 'production',
  });
  assert.ok(options);
  assert.equal(options.dsn, DSN);
  assert.equal(options.release, 'abc123');
  assert.equal(options.environment, 'qa');
  assert.deepEqual(options.dataCollection, {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    mcp: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
  });
  assert.equal(options.tracesSampleRate, undefined);
  assert.equal(options.maxBreadcrumbs, 30);
  assert.equal(typeof options.beforeSend, 'function');
  assert.equal(typeof options.beforeBreadcrumb, 'function');
  assert.equal(typeof options.integrations, 'function');
  const names = (
    options.integrations as (d: { name: string }[]) => { name: string }[]
  )([{ name: 'ProcessSession' }, { name: 'Http' }, { name: 'Nest' }]).map(
    (i) => i.name,
  );
  assert.deepEqual(names, ['Nest', 'Http']);
});

test('ambiente cai para NODE_ENV e depois development; release vazio fica de fora', () => {
  assert.equal(
    buildSentryOptions({ SENTRY_DSN: DSN, NODE_ENV: 'production' })?.environment,
    'production',
  );
  const local = buildSentryOptions({ SENTRY_DSN: DSN, RELEASE_ID: ' ' });
  assert.equal(local?.environment, 'development');
  assert.equal(local?.release, undefined);
});

test('scrubText mascara e-mail, telefone, CPF e Bearer', () => {
  const texto =
    'falhou para maria.silva@exemplo.com.br, fone (27) 99876-5432 / +55 27 998765432, ' +
    'cpf 123.456.789-09, auth Bearer eyJhbGciOi.abc.def';
  const limpo = scrubText(texto);
  assert.doesNotMatch(limpo, /maria|exemplo\.com|99876|998765432|123\.456|eyJhbGciOi/);
  assert.match(limpo, /\[email\]/);
  assert.match(limpo, /\[telefone\]/);
  assert.match(limpo, /\[cpf\]/);
  assert.match(limpo, /Bearer \[token\]/);
});

test('scrubText preserva números curtos, datas, ids e UUIDs', () => {
  const texto =
    'evento 42 em 2026-11-25 10:30, id 3f2b6c1e-9a7d-4b1e-8c2f-1a2b3c4d5e6f, porta 3000';
  assert.equal(scrubText(texto), texto);
});

test('scrubEvent tira pedido, usuário e mascara mensagens, exceções e extras', () => {
  const event = {
    message: 'contato joao@x.com',
    request: {
      url: 'https://api.exemplo.test/api/events/1?email=joao@x.com',
      method: 'POST',
      data: { email: 'joao@x.com', phone: '27999998888' },
      cookies: { sid: 'segredo' },
      headers: { authorization: 'Bearer abc', cookie: 'sid=segredo' },
      query_string: 'email=joao@x.com',
    },
    user: { id: '1', email: 'joao@x.com', ip_address: '1.2.3.4' },
    exception: {
      values: [{ type: 'Error', value: 'Unique constraint em email joao@x.com' }],
    },
    extra: { telefone: '(27) 99999-8888', aninhado: [{ texto: 'ana@y.org' }] },
    contexts: { custom: { email: 'joao@x.com' } },
  } as unknown as ErrorEvent;

  const out = scrubEvent(event);
  assert.equal(out.user, undefined);
  assert.deepEqual(out.request, {
    method: 'POST',
    url: 'https://api.exemplo.test/api/events/1',
  });
  const json = JSON.stringify(out);
  assert.doesNotMatch(json, /joao@x\.com|ana@y\.org|99999-8888|segredo|Bearer abc/);
  assert.equal(out.exception?.values?.[0]?.value, 'Unique constraint em email [email]');
});

test('scrubBreadcrumb tira query string de URLs e mascara a mensagem', () => {
  const crumb: Breadcrumb = {
    category: 'http',
    message: 'GET https://api.resend.com/emails?to=joao@x.com',
    data: { url: 'https://api.resend.com/emails?to=joao@x.com', status_code: 500 },
  };
  const out = scrubBreadcrumb(crumb);
  assert.ok(out);
  assert.equal(out.data?.url, 'https://api.resend.com/emails');
  assert.equal(out.data?.status_code, 500);
  assert.doesNotMatch(out.message ?? '', /joao@x\.com/);
});
