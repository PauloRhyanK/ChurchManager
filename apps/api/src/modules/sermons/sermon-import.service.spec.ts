import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadGatewayException, BadRequestException, HttpException, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../validation-options';
import type { AuthUser } from '../auth/auth-user';
import { GenerationLimiter } from './ai/generation-limiter';
import type { SermonAiConfig } from './ai/sermon-ai.config';
import type { SermonStructurer, StructureInput, StructureOutput } from './ai/sermon-structurer';
import { SummarizerError } from './ai/sermon-summarizer';
import type { BibleService } from './bible/bible.service';
import { CreateFromTextDto } from './dto/from-text.dto';
import type { SermonDoc } from './sermon-document';
import { SermonImportService } from './sermon-import.service';
import type { SermonsService } from './sermons.service';

const USER = { userId: 'u1', tenantId: 't1' } as AuthUser;
const ON: SermonAiConfig = {
  enabled: true,
  effort: 'low',
  models: [
    { id: 'anthropic:claude-opus-5-5', provider: 'anthropic', model: 'claude-opus-5-5', label: 'Opus' },
    { id: 'anthropic:claude-haiku-5-5', provider: 'anthropic', model: 'claude-haiku-5-5', label: 'Haiku' },
  ],
};
const TEXT = 'A luz\n\n1. A luz chama\nMateus 5:14';
const OUTLINE: StructureOutput = {
  title: 'A luz',
  blocks: [
    { kind: 'POINT', start: 2, end: 2, text: 'A luz chama', reference: '' },
    { kind: 'VERSE', start: 3, end: 3, text: '', reference: 'Mateus 5:14' },
  ],
};

function setup(over: { ai?: SermonAiConfig; reply?: () => Promise<StructureOutput>; limiter?: GenerationLimiter } = {}) {
  const asked: StructureInput[] = [];
  const created: { user: AuthUser; title: string; doc: SermonDoc }[] = [];
  const structurer: SermonStructurer = {
    structure: (input) => {
      asked.push(input);
      return (over.reply ?? (async () => OUTLINE))();
    },
  };
  const sermons = {
    createWithDocument: async (user: AuthUser, title: string, doc: SermonDoc) => {
      created.push({ user, title, doc });
      return { id: 's1', title } as never;
    },
  } as unknown as SermonsService;
  const bible = {
    search: async (q: string) =>
      q === 'Mateus 5:14'
        ? { mode: 'REFERENCE', hits: [{ reference: 'Mateus 5:14', translation: 'BLIVRE', verses: [{ number: 14, text: 'Vós sois a luz do mundo.' }] }] }
        : { mode: 'NONE', hits: [] },
  } as unknown as BibleService;
  const service = new SermonImportService(sermons, bible, over.ai ?? ON, { anthropic: structurer }, over.limiter ?? new GenerationLimiter());
  return { service, asked, created };
}

describe('SermonImportService.createFromText', () => {
  it('cria a palavra do autor com o esboço montado e o versículo da Bíblia', async () => {
    const { service, asked, created } = setup();
    await service.createFromText(USER, { text: TEXT });
    assert.deepEqual(asked[0], { lines: ['A luz', '1. A luz chama', 'Mateus 5:14'], model: 'claude-opus-5-5', effort: 'low' });
    const [{ user, title, doc }] = created;
    assert.equal(user, USER);
    assert.equal(title, 'A luz');
    assert.deepEqual(doc.content.map((b) => b.type), ['paragraph', 'point', 'verse']);
    const verse = doc.content[2] as { attrs: { translation: string; verses: { text: string }[] } };
    assert.equal(verse.attrs.translation, 'BLIVRE');
    assert.equal(verse.attrs.verses[0].text, 'Vós sois a luz do mundo.');
  });

  it('usa o modelo escolhido e recusa modelo que não está na lista', async () => {
    const { service, asked } = setup();
    await service.createFromText(USER, { text: TEXT, model: 'anthropic:claude-haiku-5-5' });
    assert.equal(asked[0].model, 'claude-haiku-5-5');
    await assert.rejects(service.createFromText(USER, { text: TEXT, model: 'anthropic:outro' }), BadRequestException);
  });

  it('sem IA, sem texto, ou com linhas demais: 400 sem chamar o provedor', async () => {
    const off = setup({ ai: { ...ON, enabled: false } });
    await assert.rejects(off.service.createFromText(USER, { text: TEXT }), BadRequestException);
    const { service, asked } = setup();
    await assert.rejects(service.createFromText(USER, { text: ' \n \n' }), BadRequestException);
    await assert.rejects(service.createFromText(USER, { text: 'x\n'.repeat(1501) }), BadRequestException);
    assert.equal(off.asked.length + asked.length, 0);
  });

  it('respeita o limite por usuário', async () => {
    const { service } = setup({ limiter: new GenerationLimiter(1) });
    await service.createFromText(USER, { text: TEXT });
    await assert.rejects(service.createFromText(USER, { text: TEXT }), (e: unknown) => e instanceof HttpException && e.getStatus() === 429);
  });

  it('falha do provedor vira resposta em pt-BR sem nada do texto', async () => {
    const refused = setup({ reply: async () => { throw new SummarizerError('REFUSED', 'x'); } });
    await assert.rejects(refused.service.createFromText(USER, { text: TEXT }), (e: unknown) =>
      e instanceof UnprocessableEntityException && /organizar este texto/.test(e.message));
    const invalid = setup({ reply: async () => { throw new SummarizerError('INVALID', 'x'); } });
    await assert.rejects(invalid.service.createFromText(USER, { text: TEXT }), BadGatewayException);
  });
});

describe('CreateFromTextDto', () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  const parse = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CreateFromTextDto });

  it('exige o texto, limita o tamanho e recusa campos a mais', async () => {
    assert.equal(((await parse({ text: '  A luz  ' })) as CreateFromTextDto).text, 'A luz');
    for (const body of [{}, { text: '' }, { text: '   ' }, { text: 'x'.repeat(30_001) }, { text: 'A luz', tenantId: 't2' }, { text: 'A luz', title: 'x' }]) {
      await assert.rejects(parse(body), BadRequestException);
    }
  });
});
