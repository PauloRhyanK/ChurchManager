import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeSermonAiConfig, ignoredSermonAiEntries, readSermonAiConfig } from './sermon-ai.config';

const KEY = { ANTHROPIC_API_KEY: 'x' };

describe('readSermonAiConfig', () => {
  it('sem chave: desligado', () => {
    assert.equal(readSermonAiConfig({}).enabled, false);
    assert.equal(readSermonAiConfig({ ANTHROPIC_API_KEY: '   ' }).enabled, false);
    assert.equal(readSermonAiConfig({ SERMON_AI_MODELS: 'anthropic:claude-opus-5-5' }).enabled, false);
  });

  it('só a chave: um modelo, Claude Opus 5.5, esforço low', () => {
    assert.deepEqual(readSermonAiConfig(KEY), {
      enabled: true,
      models: [{ id: 'anthropic:claude-opus-5-5', provider: 'anthropic', model: 'claude-opus-5-5', label: 'Claude Opus 5.5' }],
      effort: 'low',
    });
    assert.equal(readSermonAiConfig({ ...KEY, SERMON_AI_MODELS: ' ' }).models[0].id, 'anthropic:claude-opus-5-5');
  });

  it('lista com dois modelos e entradas inválidas: dois modelos, o primeiro é o padrão', () => {
    const c = readSermonAiConfig({ ...KEY, SERMON_AI_MODELS: ' anthropic:claude-haiku-5-5 , openai:gpt-x, lixo, anthropic:, anthropic:modelo-novo ' });
    assert.deepEqual(c.models, [
      { id: 'anthropic:claude-haiku-5-5', provider: 'anthropic', model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
      { id: 'anthropic:modelo-novo', provider: 'anthropic', model: 'modelo-novo', label: 'modelo-novo' },
    ]);
    assert.equal(c.enabled, true);
  });

  it('só entradas inválidas: sem modelos e desligado', () => {
    const c = readSermonAiConfig({ ...KEY, SERMON_AI_MODELS: 'openai:gpt-x' });
    assert.deepEqual(c.models, []);
    assert.equal(c.enabled, false);
  });

  it('repetido entra uma vez; rótulos da tabela', () => {
    const c = readSermonAiConfig({ ...KEY, SERMON_AI_MODELS: 'anthropic:claude-sonnet-5-5,anthropic:claude-fable-5-2,anthropic:claude-sonnet-5-5' });
    assert.deepEqual(c.models.map((m) => m.label), ['Claude Sonnet 5.5', 'Claude Fable 5.2']);
  });

  it('SERMON_AI_EFFORT válido é usado; inválido vira low', () => {
    assert.equal(readSermonAiConfig({ ...KEY, SERMON_AI_EFFORT: 'high' }).effort, 'high');
    assert.equal(readSermonAiConfig({ ...KEY, SERMON_AI_EFFORT: 'medium' }).effort, 'medium');
    assert.equal(readSermonAiConfig({ ...KEY, SERMON_AI_EFFORT: 'max' }).effort, 'low');
    assert.equal(readSermonAiConfig({ ...KEY, SERMON_AI_EFFORT: 'turbo' }).effort, 'low');
  });
});

describe('readSermonAiConfig: provedor sem diferença de maiúsculas e registro na subida', () => {
  it('Anthropic:claude-… vale como anthropic', () => {
    const c = readSermonAiConfig({ ...KEY, SERMON_AI_MODELS: 'Anthropic:claude-opus-5-5,ANTHROPIC:claude-haiku-5-5' });
    assert.deepEqual(c.models.map((m) => [m.id, m.provider, m.model]), [
      ['anthropic:claude-opus-5-5', 'anthropic', 'claude-opus-5-5'],
      ['anthropic:claude-haiku-5-5', 'anthropic', 'claude-haiku-5-5'],
    ]);
  });

  it('ignoredSermonAiEntries devolve só o texto das entradas ignoradas', () => {
    assert.deepEqual(ignoredSermonAiEntries({ SERMON_AI_MODELS: ' openai:gpt-x , anthropic:ok, lixo,, anthropic: ' }), ['openai:gpt-x', 'lixo', 'anthropic:']);
    assert.deepEqual(ignoredSermonAiEntries({}), []);
  });

  it('describeSermonAiConfig: ligada/desligada, quantos modelos e as entradas ignoradas; nunca a chave', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-segredo', SERMON_AI_MODELS: 'anthropic:claude-opus-5-5,openai:gpt-x' };
    const lines = describeSermonAiConfig(env);
    assert.deepEqual(lines, [
      'IA dos slides completos: ligada, 1 modelo(s).',
      'SERMON_AI_MODELS: entradas ignoradas: openai:gpt-x',
    ]);
    assert.equal(lines.join('\n').includes('sk-ant'), false);
    assert.deepEqual(describeSermonAiConfig({}), ['IA dos slides completos: desligada, 1 modelo(s).']);
  });
});
