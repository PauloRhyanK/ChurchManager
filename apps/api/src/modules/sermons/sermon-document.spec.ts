import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { DOC_LIMITS, EMPTY_DOC, SermonDoc, validateSermonDocument } from './sermon-document';

const t = (text: string) => ({ type: 'text', text });
const p = (text?: string) => (text === undefined ? { type: 'paragraph' } : { type: 'paragraph', content: [t(text)] });

function verse(id: string, reference: string, book: number, chapter: number, verseNo: number, text: string) {
  return {
    type: 'verse',
    attrs: {
      id,
      reference,
      book,
      chapter,
      verseStart: verseNo,
      verseEnd: verseNo,
      translation: 'BLIVRE',
      verses: [{ number: verseNo, text }],
    },
  };
}

const EXEMPLO = {
  type: 'doc',
  content: [
    verse('v1', 'João 8:12', 43, 8, 12, 'Eu sou a luz do mundo; quem me segue não andará em trevas.'),
    { type: 'paragraph', content: [t('Todo mundo já ficou sem luz em casa. A primeira coisa que a gente faz é procurar onde está a vela.')] },
    { type: 'point', attrs: { id: 'pt1' }, content: [t('A luz chama')] },
    p('Antes de a gente procurar, a luz já estava acesa. Ninguém acha o caminho sozinho no escuro.'),
    verse('v2', 'Salmos 119:105', 19, 119, 105, 'Lâmpada para os meus pés é a tua palavra, e luz para o meu caminho.'),
    { type: 'illustration', attrs: { id: 'i1' }, content: [p('A lanterna na trilha: ela não mostra a montanha inteira, só o próximo passo.')] },
    { type: 'privateNote', attrs: { id: 'n1' }, content: [p('Dois minutos nessa história, não mais. Olhar para o lado esquerdo do templo.')] },
    { type: 'point', attrs: { id: 'pt2' }, content: [t('A luz mostra')] },
    p('Luz não serve para ser olhada, serve para a gente enxergar o resto.'),
    { type: 'application', attrs: { id: 'a1' }, content: [p('O que você tem evitado olhar, por medo do que a luz vai mostrar?')] },
  ],
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const recusa = (input: unknown) => assert.throws(() => validateSermonDocument(input), BadRequestException);

test('aceita o documento de exemplo, devolvendo o mesmo conteúdo', () => {
  assert.deepEqual(validateSermonDocument(EXEMPLO), EXEMPLO);
});

test('aceita EMPTY_DOC', () => {
  assert.deepEqual(validateSermonDocument(EMPTY_DOC), EMPTY_DOC);
});

test('aceita listas, marcas, quebra de linha, título e versículo digitado à mão', () => {
  const ok: SermonDoc = validateSermonDocument(
    doc(
      { type: 'heading', attrs: { id: 'h1', level: 2 }, content: [t('Conclusão')] },
      { type: 'heading', attrs: { id: 'h2', level: 3 } },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }, { type: 'italic' }] }, { type: 'hardBreak' }] }] },
          { type: 'listItem', content: [{ type: 'orderedList', content: [{ type: 'listItem', content: [p('y')] }] }] },
        ],
      },
      {
        type: 'verse',
        attrs: { id: 'v', reference: 'Texto livre', book: null, chapter: null, verseStart: null, verseEnd: null, translation: null, verses: [{ number: null, text: 'abc' }] },
      },
    ),
  );
  assert.equal(ok.content.length, 4);
});

test('recusa o que está fora do esquema', () => {
  recusa(doc({ type: 'image' }));
  recusa(doc({ type: 'paragraph', attrs: { style: 'x' } }));
  recusa(doc({ type: 'paragraph', extra: 1 }));
  recusa(doc({ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'link' }] }] }));
  recusa(doc({ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'bold', attrs: {} }] }] }));
  recusa(doc({ type: 'heading', attrs: { id: 'h', level: 1 } }));
  recusa(doc({ type: 'heading', attrs: { id: 'h', level: 4 } }));
  recusa(doc({ ...clone(EXEMPLO.content[0]), content: [p('x')] }));
  recusa(doc({ type: 'paragraph', content: [{ type: 'text', text: '' }] }));
  recusa(doc({ type: 'paragraph', content: [{ type: 'text', text: 'a', bold: true }] }));
  recusa(doc({ type: 'paragraph', content: [{ type: 'point' }] }));
  recusa(doc({ type: 'point', attrs: { id: 'x' }, content: [p('x')] }));
  recusa(doc({ type: 'illustration', attrs: { id: 'x' }, content: [{ type: 'point', attrs: { id: 'y' } }] }));
  recusa(doc({ type: 'illustration', attrs: { id: 'x' } }));
  recusa(doc({ type: 'bulletList', content: [p('x')] }));
  recusa(doc({ type: 'listItem', content: [p('x')] }));
  const v = clone(EXEMPLO.content[0]) as ReturnType<typeof verse>;
  recusa(doc({ ...v, attrs: { ...v.attrs, book: 67 } }));
  recusa(doc({ ...v, attrs: { ...v.attrs, book: 0 } }));
  recusa(doc({ ...v, attrs: { ...v.attrs, extra: 1 } }));
  recusa(doc({ ...v, attrs: { ...v.attrs, verses: [{ number: 0, text: 'a' }] } }));
  recusa(doc({ ...v, attrs: { ...v.attrs, verses: [{ number: 1, text: 'a', x: 1 }] } }));
  recusa(doc({ ...v, attrs: { ...v.attrs, translation: 5 } }));
  recusa(doc({ ...v, attrs: { ...v.attrs, id: '' } }));
});

test('recusa entrada que não é um documento', () => {
  recusa(null);
  recusa([]);
  recusa('doc');
  recusa({ type: 'doc' });
  recusa({ type: 'doc', content: 'x' });
  recusa({ type: 'doc', content: [], extra: 1 });
  recusa({ type: 'paragraph', content: [] });
});

test('mensagens de erro em pt-BR', () => {
  assert.throws(() => validateSermonDocument(doc({ type: 'image' })), (e: BadRequestException) => /Documento inválido/.test(e.message));
});

test('limites: nós', () => {
  const n = (k: number) => doc(...Array.from({ length: k }, () => ({ type: 'paragraph' })));
  validateSermonDocument(n(DOC_LIMITS.nodes));
  recusa(n(DOC_LIMITS.nodes + 1));
});

test('limites: caracteres', () => {
  const chars = (total: number) => doc(...Array.from({ length: total / 1000 }, () => p('a'.repeat(1000))), ...(total % 1000 ? [p('a'.repeat(total % 1000))] : []));
  validateSermonDocument(chars(DOC_LIMITS.chars));
  recusa(chars(DOC_LIMITS.chars + 1));
});

test('limites: profundidade', () => {
  const lists = (levels: number, leaf: unknown): unknown => {
    let node = leaf;
    for (let i = 0; i < levels; i++) node = { type: 'bulletList', content: [{ type: 'listItem', content: [node] }] };
    return node;
  };
  // doc(1) > 2 níveis de lista (4) > parágrafo(5) > texto(6) ... até 8
  validateSermonDocument(doc(lists(2, p('x'))));
  validateSermonDocument(doc(lists(2, { type: 'paragraph', content: [t('x')] }), lists(2, p('y'))));
  validateSermonDocument(doc(lists(3, { type: 'paragraph' })));
  recusa(doc(lists(3, p('x'))));
  recusa(doc(lists(4, { type: 'paragraph' })));
});

test('limites: id, reference e versículos', () => {
  const v = clone(EXEMPLO.content[0]) as ReturnType<typeof verse>;
  validateSermonDocument(doc({ ...v, attrs: { ...v.attrs, id: 'x'.repeat(DOC_LIMITS.id) } }));
  recusa(doc({ ...v, attrs: { ...v.attrs, id: 'x'.repeat(DOC_LIMITS.id + 1) } }));
  recusa(doc({ type: 'point', attrs: { id: 'x'.repeat(37) } }));
  validateSermonDocument(doc({ ...v, attrs: { ...v.attrs, reference: 'r'.repeat(DOC_LIMITS.reference) } }));
  recusa(doc({ ...v, attrs: { ...v.attrs, reference: 'r'.repeat(DOC_LIMITS.reference + 1) } }));
  const many = (k: number) => doc({ ...v, attrs: { ...v.attrs, verses: Array.from({ length: k }, (_, i) => ({ number: i + 1, text: 'a' })) } });
  validateSermonDocument(many(DOC_LIMITS.verses));
  recusa(many(DOC_LIMITS.verses + 1));
});
