import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages';
import { ANTHROPIC_CLIENT_OPTIONS, createMessage, readResponseJson, type AnthropicMessagesClient } from './anthropic-client';
import { SummarizerError } from './sermon-summarizer';

// O cliente real do SDK precisa caber no tipo que as chamadas recebem.
const realClientFits = (c: Anthropic): AnthropicMessagesClient => c;
void realClientFits;

function message(over: Partial<BetaMessage>): BetaMessage {
  return {
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
    content: [], stop_reason: 'end_turn', stop_sequence: null,
    ...over,
  } as unknown as BetaMessage;
}
const textReply = (text: string) => message({ content: [{ type: 'text', text, citations: null }] as unknown as BetaMessage['content'] });

function fakeClient(reply: () => Promise<BetaMessage>) {
  const calls: MessageCreateParamsNonStreaming[] = [];
  const client: AnthropicMessagesClient = {
    beta: { messages: { create: (params: MessageCreateParamsNonStreaming) => { calls.push(params); return reply(); } } },
  };
  return { client, calls };
}

const BASE: MessageCreateParamsNonStreaming = {
  model: 'claude-opus-5-5',
  max_tokens: 100,
  system: 'regras',
  messages: [{ role: 'user', content: 'texto' }],
};
const OK = JSON.stringify({ ok: true });
const run = (reply: () => Promise<BetaMessage>, base = BASE) => createMessage(fakeClient(reply).client, base).then(readResponseJson);
const rejectsWith = async (reply: () => Promise<BetaMessage>, reason: SummarizerError['reason']) => {
  await assert.rejects(run(reply), (e: unknown) => e instanceof SummarizerError && e.reason === reason);
};

describe('readResponseJson', () => {
  it('lê o JSON do texto da resposta', async () => {
    assert.deepEqual(await run(async () => textReply(OK)), { ok: true });
  });

  it('depois de um reencaminhamento, lê só o texto do modelo que respondeu', async () => {
    const content = [
      { type: 'text', text: '{"pela', citations: null },
      { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } },
      { type: 'text', text: OK, citations: null },
    ];
    assert.deepEqual(await run(async () => message({ content: content as unknown as BetaMessage['content'] })), { ok: true });
  });

  it('refusal → REFUSED; max_tokens → TRUNCATED, mesmo com texto', async () => {
    await rejectsWith(async () => message({ stop_reason: 'refusal', content: [{ type: 'text', text: OK, citations: null }] as unknown as BetaMessage['content'] }), 'REFUSED');
    await rejectsWith(async () => message({ stop_reason: 'max_tokens', content: [{ type: 'text', text: OK, citations: null }] as unknown as BetaMessage['content'] }), 'TRUNCATED');
  });

  it('JSON malformado ou sem texto → INVALID', async () => {
    await rejectsWith(async () => textReply('{"blocos": ['), 'INVALID');
    await rejectsWith(async () => message({ content: [] }), 'INVALID');
  });
});

describe('createMessage: erros do SDK', () => {
  it('autenticação/permissão → AUTH; limite → RATE_LIMIT; 400 → CONFIG; conexão e demais → UNAVAILABLE', async () => {
    const headers = new Headers();
    const auth = Anthropic.APIError.generate(401, { error: { type: 'authentication_error', message: 'x' } }, 'chave sk-ant-NAO-VAZA', headers);
    const perm = Anthropic.APIError.generate(403, { error: { type: 'permission_error', message: 'x' } }, 'x', headers);
    const rate = Anthropic.APIError.generate(429, { error: { type: 'rate_limit_error', message: 'x' } }, 'x', headers);
    const server = Anthropic.APIError.generate(529, { error: { type: 'overloaded_error', message: 'x' } }, 'x', headers);
    const bad = Anthropic.APIError.generate(400, { error: { type: 'invalid_request_error', message: 'x' } }, 'x', headers);
    assert.ok(auth instanceof Anthropic.AuthenticationError);
    assert.ok(perm instanceof Anthropic.PermissionDeniedError);
    assert.ok(rate instanceof Anthropic.RateLimitError);
    const conn = new Anthropic.APIConnectionError({ message: 'rede' });
    const cases: [unknown, SummarizerError['reason']][] = [
      [auth, 'AUTH'], [perm, 'AUTH'], [rate, 'RATE_LIMIT'], [conn, 'UNAVAILABLE'], [server, 'UNAVAILABLE'], [bad, 'CONFIG'],
    ];
    for (const [err, reason] of cases) await rejectsWith(async () => { throw err; }, reason);
    await assert.rejects(run(async () => { throw auth; }), (e: unknown) => e instanceof SummarizerError && !e.message.includes('sk-ant'));
  });

  it('erro que não é do SDK passa adiante sem disfarce', async () => {
    const bug = new TypeError('defeito');
    await assert.rejects(run(async () => { throw bug; }), (e: unknown) => e === bug);
  });
});

const apiError = (status: number, type: string) =>
  Anthropic.APIError.generate(status, { type: 'error', error: { type, message: 'mensagem do provedor sk-ant-x' } }, 'mensagem', new Headers());

describe('createMessage: fallbacks só onde existem', () => {
  const sendTo = async (model: string) => {
    const { client, calls } = fakeClient(async () => textReply(OK));
    await createMessage(client, { ...BASE, model });
    return calls[0];
  };

  it('Haiku e modelos sem fallback: sem betas nem fallbacks', async () => {
    for (const model of ['claude-haiku-5-5', 'claude-sonnet-5', 'modelo-novo']) {
      const p = await sendTo(model);
      assert.equal('fallbacks' in p, false, model);
      assert.equal('betas' in p, false, model);
    }
  });

  it('Opus 5.x, Fable 5, Mythos 5 e Sonnet 5.5: com fallbacks default e o header beta', async () => {
    for (const model of ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-mythos-5-2', 'claude-sonnet-5-5']) {
      const p = await sendTo(model);
      assert.equal(p.fallbacks, 'default', model);
      assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01'], model);
    }
  });

  it('400 com fallbacks: uma nova tentativa sem betas/fallbacks', async () => {
    let n = 0;
    const { client, calls } = fakeClient(async () => {
      n++;
      if (n === 1) throw apiError(400, 'invalid_request_error');
      return textReply(OK);
    });
    assert.deepEqual(readResponseJson(await createMessage(client, BASE)), { ok: true });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].fallbacks, 'default');
    assert.equal('fallbacks' in calls[1], false);
    assert.equal('betas' in calls[1], false);
    assert.equal(calls[1].model, 'claude-opus-5-5');
  });

  it('400 de novo: CONFIG com status e type, sem a mensagem do provedor', async () => {
    const { client, calls } = fakeClient(async () => {
      throw apiError(400, 'invalid_request_error');
    });
    await assert.rejects(createMessage(client, BASE), (e: unknown) => {
      assert.ok(e instanceof SummarizerError);
      assert.equal(e.reason, 'CONFIG');
      assert.equal(e.status, 400);
      assert.equal(e.type, 'invalid_request_error');
      assert.equal(e.message.includes('sk-ant'), false);
      assert.equal(e.message.includes('mensagem do provedor'), false);
      return true;
    });
    assert.equal(calls.length, 2);
  });

  it('sem fallbacks não há nova tentativa; 404 → CONFIG; 429 com fallbacks não repete', async () => {
    const haiku = fakeClient(async () => {
      throw apiError(404, 'not_found_error');
    });
    await assert.rejects(createMessage(haiku.client, { ...BASE, model: 'claude-haiku-5-5' }), (e: unknown) =>
      e instanceof SummarizerError && e.reason === 'CONFIG' && e.status === 404 && e.type === 'not_found_error');
    assert.equal(haiku.calls.length, 1);
    const rate = fakeClient(async () => {
      throw apiError(429, 'rate_limit_error');
    });
    await assert.rejects(createMessage(rate.client, BASE), (e: unknown) =>
      e instanceof SummarizerError && e.reason === 'RATE_LIMIT' && e.status === 429 && e.type === 'rate_limit_error');
    assert.equal(rate.calls.length, 1);
  });

  it('status e type nos demais erros; AnthropicError solto → UNAVAILABLE', async () => {
    const auth = fakeClient(async () => {
      throw apiError(401, 'authentication_error');
    });
    await assert.rejects(createMessage(auth.client, BASE), (e: unknown) =>
      e instanceof SummarizerError && e.reason === 'AUTH' && e.status === 401 && e.type === 'authentication_error');
    const bare = fakeClient(async () => {
      throw new Anthropic.AnthropicError('cliente sem chave');
    });
    await assert.rejects(createMessage(bare.client, BASE), (e: unknown) =>
      e instanceof SummarizerError && e.reason === 'UNAVAILABLE' && e.status === undefined && e.type === undefined);
    const conn = fakeClient(async () => {
      throw new Anthropic.APIConnectionError({ message: 'rede' });
    });
    await assert.rejects(createMessage(conn.client, BASE), (e: unknown) =>
      e instanceof SummarizerError && e.reason === 'UNAVAILABLE' && e.status === undefined && e.type === undefined);
  });
});

describe('cliente do SDK', () => {
  it('uma tentativa de até 45 s, sem novas tentativas (cabe nos 60 s do proxy)', () => {
    assert.deepEqual(ANTHROPIC_CLIENT_OPTIONS, { timeout: 45_000, maxRetries: 0 });
  });
});
