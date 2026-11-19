import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLE_DOC } from './sermon-example';
import type { SermonBlock, SermonDoc } from './sermon-document';
import {
  buildSlides,
  countSlides,
  mergeSlides,
  parseStoredSlides,
  publicSlides,
  type SlideItem,
} from './sermon-slides';

const verseBlock = (id: string, reference: string, verses: { number: number | null; text: string }[]): SermonBlock => ({
  type: 'verse',
  attrs: { id, reference, book: null, chapter: null, verseStart: null, verseEnd: null, translation: null, verses },
});
const doc = (...content: SermonBlock[]): SermonDoc => ({ type: 'doc', content });
const point = (id: string, text: string): SermonBlock => ({ type: 'point', attrs: { id }, content: text ? [{ type: 'text', text }] : [] });
const item = (id: string, over: Partial<SlideItem> = {}): SlideItem => ({
  id,
  kind: 'POINT',
  sourceBlockId: id.split(':')[0],
  text: `texto ${id}`,
  reference: null,
  included: true,
  edited: false,
  ...over,
});

describe('buildSlides', () => {
  it('só versículos no exemplo, com a nota privada no fim desmarcada', () => {
    const s = buildSlides('Luz', EXAMPLE_DOC, 'VERSES');
    assert.deepEqual(s.map((x) => [x.id, x.kind, x.reference, x.included]), [
      ['v1:0', 'VERSE', 'João 8:12', true],
      ['v2:0', 'VERSE', 'Salmos 119:105', true],
      ['n1:0', 'PRIVATE', null, false],
    ]);
  });

  it('versículos e pontos: título, versículo, ponto, na ordem', () => {
    const s = buildSlides('  Luz  ', EXAMPLE_DOC, 'VERSES_AND_POINTS');
    assert.deepEqual(s.map((x) => [x.kind, x.text === 'Luz' || x.kind !== 'TITLE']), [
      ['TITLE', true], ['VERSE', true], ['POINT', true], ['VERSE', true], ['POINT', true], ['PRIVATE', true],
    ]);
    assert.equal(s[0].id, 'title');
    assert.equal(s[0].sourceBlockId, null);
    assert.equal(s[2].text, 'A luz chama');
    assert.equal(s[4].text, 'A luz mostra');
    assert.equal(s[5].included, false);
    assert.ok(s.every((x) => x.edited === false));
  });

  it('countSlides não conta PRIVATE', () => {
    assert.deepEqual(countSlides('Luz', EXAMPLE_DOC), { VERSES: 2, VERSES_AND_POINTS: 5 });
  });

  it('bloco com vários versículos numera a referência e os ids', () => {
    const d = doc(verseBlock('v9', 'Mateus 5:14-16', [
      { number: 14, text: 'a' }, { number: 15, text: 'b' }, { number: 16, text: 'c' },
    ]));
    const s = buildSlides('', d, 'VERSES');
    assert.deepEqual(s.map((x) => [x.id, x.reference]), [
      ['v9:0', 'Mateus 5:14'], ['v9:1', 'Mateus 5:15'], ['v9:2', 'Mateus 5:16'],
    ]);
  });

  it('divide versículo longo em pedaços de até 220 que terminam em pontuação', () => {
    const sentence = 'Esta é uma frase de tamanho médio que se repete para encher o texto do versículo longo.';
    const text = Array(6).fill(sentence).join(' ');
    assert.ok(text.length > 220 && text.length < 600);
    const s = buildSlides('', doc(verseBlock('v1', 'João 1:1', [{ number: 1, text }])), 'VERSES');
    assert.ok(s.length > 1);
    for (const x of s) {
      assert.ok(x.text.length <= 220);
      assert.match(x.text, /[.;:?!]$/);
    }
    assert.equal(s.map((x) => x.text).join(' '), text);
    assert.deepEqual(s.map((x) => x.id), s.map((_, i) => `v1:${i}`));
    assert.ok(s.every((x) => x.reference === 'João 1:1'));
  });

  it('corta no último espaço quando a frase passa de 220 e seco quando não há espaço', () => {
    const words = Array(80).fill('palavra').join(' ');
    const a = buildSlides('', doc(verseBlock('v1', 'João 1:1', [{ number: 1, text: words }])), 'VERSES');
    assert.ok(a.every((x) => x.text.length <= 220));
    assert.equal(a.map((x) => x.text).join(' '), words);
    const solid = 'x'.repeat(500);
    const b = buildSlides('', doc(verseBlock('v1', 'João 1:1', [{ number: 1, text: solid }])), 'VERSES');
    assert.deepEqual(b.map((x) => x.text.length), [220, 220, 60]);
  });

  it('versículo digitado à mão sem número usa a referência do bloco; vazio não gera item', () => {
    const d = doc(verseBlock('v1', 'Mateus 5:14-16', [{ number: null, text: 'livre' }, { number: 15, text: '   ' }]));
    const s = buildSlides('', d, 'VERSES');
    assert.equal(s.length, 1);
    assert.equal(s[0].reference, 'Mateus 5:14-16');
  });

  it('título vazio não gera TITLE; ilustração e aplicação não geram item; documento vazio dá []', () => {
    const s = buildSlides('   ', EXAMPLE_DOC, 'VERSES_AND_POINTS');
    assert.equal(s.some((x) => x.kind === 'TITLE'), false);
    assert.equal(s.some((x) => x.sourceBlockId === 'i1' || x.sourceBlockId === 'a1'), false);
    assert.deepEqual(buildSlides('T', doc(), 'VERSES_AND_POINTS').map((x) => x.kind), ['TITLE']);
    assert.deepEqual(buildSlides('', doc(), 'VERSES'), []);
  });

  it('ponto vazio e nota vazia não geram item', () => {
    const empty: SermonBlock = { type: 'privateNote', attrs: { id: 'n' }, content: [{ type: 'paragraph' }] };
    assert.deepEqual(buildSlides('', doc(point('p', ''), empty), 'VERSES_AND_POINTS'), []);
  });

  it('nota privada de 200 caracteres vira rótulo de 80 mais reticências', () => {
    const note: SermonBlock = {
      type: 'privateNote', attrs: { id: 'n' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'y'.repeat(200) }] }],
    };
    const s = buildSlides('', doc(note), 'VERSES');
    assert.equal(s[0].text, 'y'.repeat(80) + '…');
  });

  it('título e ponto passam de 300: corta no último espaço antes de 300, sem espaço no fim, com reticências', () => {
    const long = 'palavra '.repeat(50).trim();
    const s = buildSlides(long, doc(point('p', long)), 'VERSES_AND_POINTS');
    const expected = Array(37).fill('palavra').join(' ') + '…';
    assert.equal(s[0].kind, 'TITLE');
    assert.equal(s[0].text, expected);
    assert.equal(s[1].text, expected);
    assert.ok(Array.from(s[1].text).length <= 300);
  });

  it('texto sem espaço e com emoji é cortado sem partir caractere', () => {
    const s = buildSlides('', doc(point('p', '😀'.repeat(400))), 'VERSES_AND_POINTS');
    assert.equal(s[0].text, '😀'.repeat(299) + '…');
  });

  it('ponto de até 300 fica inteiro', () => {
    const exact = 'a'.repeat(300);
    assert.equal(buildSlides('', doc(point('p', exact)), 'VERSES_AND_POINTS')[0].text, exact);
  });

  it('corta em 400 itens tirando os PRIVATE primeiro', () => {
    const blocks: SermonBlock[] = [];
    for (let i = 0; i < 405; i++) blocks.push(point(`p${i}`, `ponto ${i}`));
    blocks.push({ type: 'privateNote', attrs: { id: 'n' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'n' }] }] });
    const s = buildSlides('', doc(...blocks), 'VERSES_AND_POINTS');
    assert.equal(s.length, 400);
    assert.equal(s.some((x) => x.kind === 'PRIVATE'), false);
  });
});

describe('mergeSlides', () => {
  it('mantém desmarcado, mantém a ordem do pregador e ignora o que sumiu', () => {
    const prev = [item('b:0', { included: false }), item('a:0'), item('gone:0')];
    const fresh = [item('a:0'), item('b:0')];
    const m = mergeSlides(prev, fresh);
    assert.deepEqual(m.map((x) => [x.id, x.included]), [['b:0', false], ['a:0', true]]);
  });

  it('texto editado fica; não editado recebe o texto novo', () => {
    const prev = [item('a:0', { text: 'meu', edited: true }), item('b:0', { text: 'velho' })];
    const fresh = [item('a:0', { text: 'novo A' }), item('b:0', { text: 'novo B' })];
    const m = mergeSlides(prev, fresh);
    assert.deepEqual(m.map((x) => [x.text, x.edited]), [['meu', true], ['novo B', false]]);
  });

  it('item novo entra depois do que o antecede; sem antecessor, no começo', () => {
    const prev = [item('a:0'), item('c:0')];
    const fresh = [item('z:0'), item('a:0'), item('b:0'), item('c:0')];
    assert.deepEqual(mergeSlides(prev, fresh).map((x) => x.id), ['z:0', 'a:0', 'b:0', 'c:0']);
  });

  it('PRIVATE volta desmarcado e fica no fim', () => {
    const prev = [item('n:0', { kind: 'PRIVATE', included: true }), item('a:0')];
    const fresh = [item('a:0'), item('n:0', { kind: 'PRIVATE', included: false })];
    const m = mergeSlides(prev, fresh);
    assert.deepEqual(m.map((x) => [x.id, x.included]), [['a:0', true], ['n:0', false]]);
  });
});

describe('publicSlides e parseStoredSlides', () => {
  it('publicSlides só devolve incluídos que não são PRIVATE, só com kind, text e reference', () => {
    const items = [
      item('a:0', { kind: 'VERSE', reference: 'João 8:12' }),
      item('b:0', { included: false }),
      item('n:0', { kind: 'PRIVATE', included: true }),
    ];
    assert.deepEqual(publicSlides(items), [{ kind: 'VERSE', text: 'texto a:0', reference: 'João 8:12' }]);
  });

  it('parseStoredSlides descarta o que está fora do formato', () => {
    assert.deepEqual(parseStoredSlides(null), []);
    assert.deepEqual(parseStoredSlides({}), []);
    const good = item('a:0');
    const bad = { ...item('b:0'), id: undefined };
    assert.deepEqual(parseStoredSlides([good, bad, 'x', { ...good, kind: 'OUTRO' }]), [good]);
  });

  it('parseStoredSlides: PRIVATE vira desmarcado, id repetido fica o primeiro, texto longo é cortado', () => {
    const priv = item('n:0', { kind: 'PRIVATE', included: true });
    assert.equal(parseStoredSlides([priv])[0].included, false);
    const dup = parseStoredSlides([item('a:0', { text: 'primeiro' }), item('a:0', { text: 'segundo' })]);
    assert.deepEqual(dup.map((x) => x.text), ['primeiro']);
    const long = parseStoredSlides([item('p:0', { text: 'z'.repeat(500) }), item('v:0', { kind: 'VERSE', text: 'z'.repeat(500) })]);
    assert.equal(long[0].text.length, 300);
    assert.equal(long[1].text.length, 500);
  });

  it('parseStoredSlides: texto longo é cortado em 300 caracteres sem partir emoji', () => {
    const [p] = parseStoredSlides([item('a:0', { text: '😀'.repeat(301) })]);
    assert.equal(p.text, '😀'.repeat(300));
  });

  it('parseStoredSlides: 401 itens válidos viram 400', () => {
    const many = Array.from({ length: 401 }, (_, i) => item(`b${i}:0`));
    assert.equal(parseStoredSlides(many).length, 400);
  });
});

describe('casos de borda', () => {
  it('mergeSlides nunca repete id mesmo com repetição em previous', () => {
    const prev = [item('a:0'), item('a:0', { included: false }), item('b:0')];
    const m = mergeSlides(prev, [item('a:0'), item('b:0')]);
    assert.deepEqual(m.map((x) => x.id), ['a:0', 'b:0']);
  });

  it('versículo de 220 caracteres é um pedaço; de 221, dois sem vazio', () => {
    const one = buildSlides('', doc(verseBlock('v', 'João 1:1', [{ number: 1, text: 'ab '.repeat(73) + 'a' }])), 'VERSES');
    assert.equal(one.length, 1);
    assert.equal(one[0].text.length, 220);
    const two = buildSlides('', doc(verseBlock('v', 'João 1:1', [{ number: 1, text: 'ab '.repeat(73) + 'ab' }])), 'VERSES');
    assert.equal(two.length, 2);
    assert.ok(two.every((x) => x.text.length > 0 && x.text.length <= 220));
  });

  it('versículo só de espaços não gera item', () => {
    assert.deepEqual(buildSlides('', doc(verseBlock('v', 'João 1:1', [{ number: 1, text: ' \n\t ' }])), 'VERSES'), []);
  });

  it('versículo de 100 mil caracteres termina e todo pedaço tem de 1 a 220', () => {
    const text = Array(20000).fill('amen').join(' ');
    const s = buildSlides('', doc(verseBlock('v', 'João 1:1', [{ number: 1, text }])), 'VERSES');
    assert.ok(s.length > 0 && s.length <= 400);
    assert.ok(s.every((x) => x.text.length >= 1 && x.text.length <= 220));
  });

  it('rótulo privado corta por ponto de código e sem espaço antes das reticências', () => {
    const emoji = '😀'.repeat(100);
    const n = (t: string): SermonBlock => ({ type: 'privateNote', attrs: { id: 'n' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
    assert.equal(buildSlides('', doc(n(emoji)), 'VERSES')[0].text, '😀'.repeat(80) + '…');
    const spaced = 'a'.repeat(79) + ' ' + 'b'.repeat(50);
    assert.equal(buildSlides('', doc(n(spaced)), 'VERSES')[0].text, 'a'.repeat(79) + '…');
  });
});
