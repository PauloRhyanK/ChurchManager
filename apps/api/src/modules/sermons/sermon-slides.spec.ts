import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLE_DOC } from './sermon-example';
import type { SermonBlock, SermonDoc } from './sermon-document';
import {
  aiTargets,
  buildSlides,
  cleanDecisions,
  countSlides,
  mergeSlides,
  parseStoredSlides,
  publicSlides,
  slideFace,
  summaryTargets,
  SLIDE_MODEL_LIMITS,
  SUMMARY_MAX,
  type AiDecision,
  type AiTarget,
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
  layout: 'M01',
  heading: null,
  subtitle: null,
  version: null,
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
    assert.deepEqual(countSlides('Luz', EXAMPLE_DOC), { VERSES: 2, VERSES_AND_POINTS: 5, FULL: 8 });
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

  it('título de 120 vira dois TITLE de até 75; ponto de 200 vira três POINT de até 75, todos M01, sem perder texto', () => {
    const title = Array(15).fill('palavra').join(' ');
    assert.equal(title.length, 119);
    const pointText = Array(25).fill('palavra').join(' ');
    assert.equal(pointText.length, 199);
    const s = buildSlides(title, doc(point('p', pointText)), 'VERSES_AND_POINTS');
    assert.deepEqual(s.map((x) => [x.id, x.kind, x.layout]), [
      ['title', 'TITLE', 'M01'], ['title:1', 'TITLE', 'M01'],
      ['p:0', 'POINT', 'M01'], ['p:1', 'POINT', 'M01'], ['p:2', 'POINT', 'M01'],
    ]);
    assert.ok(s.every((x) => Array.from(x.text).length <= 75 && !x.text.endsWith('…')));
    assert.equal(s.slice(0, 2).map((x) => x.text).join(' '), title);
    assert.equal(s.slice(2).map((x) => x.text).join(' '), pointText);
    assert.ok(s.slice(2).every((x) => x.sourceBlockId === 'p'));
  });

  it('texto sem espaço e com emoji é dividido sem partir caractere', () => {
    const s = buildSlides('', doc(point('p', '😀'.repeat(400))), 'VERSES_AND_POINTS');
    assert.deepEqual(s.map((x) => Array.from(x.text).length), [75, 75, 75, 75, 75, 25]);
    assert.equal(s.map((x) => x.text).join(''), '😀'.repeat(400));
  });

  it('ponto de 75 fica inteiro; de 76 vira dois', () => {
    assert.equal(buildSlides('', doc(point('p', 'a'.repeat(75))), 'VERSES_AND_POINTS').length, 1);
    assert.equal(buildSlides('', doc(point('p', 'a'.repeat(76))), 'VERSES_AND_POINTS').length, 2);
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
  it('publicSlides só devolve incluídos que não são PRIVATE', () => {
    const items = [
      item('a:0', { kind: 'VERSE', reference: 'João 8:12', layout: 'M03' }),
      item('b:0', { included: false }),
      item('n:0', { kind: 'PRIVATE', included: true }),
    ];
    assert.deepEqual(publicSlides(items), [
      { kind: 'VERSE', text: 'texto a:0', layout: 'M03', title: 'João 8:12', subtitle: null, verse: 'texto a:0', reference: 'João 8:12' },
    ]);
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

const para = (text: string): SermonBlock => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const inner = (type: 'illustration' | 'application' | 'privateNote', id: string, text: string): SermonBlock => ({
  type, attrs: { id }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const heading = (id: string, text: string, level: 2 | 3 = 2): SermonBlock => ({ type: 'heading', attrs: { id, level }, content: [{ type: 'text', text }] });

const OPENING = 'Quando eu era criança a luz acabava toda semana e a casa inteira ficava parada esperando alguém achar a vela.';
const CONCLUSION = 'Saia daqui hoje sabendo que a luz que chama é a mesma que mostra o caminho de cada dia.';
const SECRET = 'SEGREDO do pregador que nunca sai daqui';
const FULL_DOC: SermonDoc = {
  type: 'doc',
  content: [
    para(OPENING),
    ...EXAMPLE_DOC.content,
    inner('illustration', 'i2', 'Uma vela acesa.'),
    heading('h1', 'Conclusão'),
    para(CONCLUSION),
    inner('privateNote', 'n2', SECRET),
    heading('h3', 'Subtítulo de nível três', 3),
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lembre disso.' }] }] }] },
  ],
};

const D = (text: string, layout: AiDecision['layout'] = 'M02'): AiDecision => ({ layout, text });

describe('buildSlides FULL', () => {
  const decisions = { 'opening:0': D('Abre'), 'i1:0': D('Lanterna'), 'a1:0': D('Aplica'), 'h1:0': D('Conclui') };

  it('põe cada SUMMARY na posição do alvo, em M02, com o título de contexto', () => {
    const s = buildSlides('Luz', FULL_DOC, 'FULL', decisions);
    assert.deepEqual(s.map((x) => [x.id, x.kind]), [
      ['title', 'TITLE'],
      ['opening:0', 'SUMMARY'],
      ['v1:0', 'VERSE'],
      ['pt1:0', 'POINT'],
      ['v2:0', 'VERSE'],
      ['i1:0', 'SUMMARY'],
      ['pt2:0', 'POINT'],
      ['a1:0', 'SUMMARY'],
      ['h1:0', 'SUMMARY'],
      ['n1:0', 'PRIVATE'],
      ['n2:0', 'PRIVATE'],
    ]);
    const conclusion = s.find((x) => x.id === 'h1:0')!;
    assert.deepEqual(conclusion, {
      id: 'h1:0', kind: 'SUMMARY', sourceBlockId: 'h1', text: 'Conclui', reference: null, included: true, edited: false,
      layout: 'M02', heading: 'Conclusão', subtitle: null, version: null,
    });
    assert.equal(s.find((x) => x.id === 'opening:0')!.sourceBlockId, null);
    assert.deepEqual(s.filter((x) => x.kind === 'SUMMARY').map((x) => [x.id, x.heading]), [
      ['opening:0', 'Luz'], ['i1:0', 'A luz chama'], ['a1:0', 'A luz mostra'], ['h1:0', 'Conclusão'],
    ]);
  });

  it('alvo sem frase não vira item; sem decisões é igual a versículos e pontos', () => {
    const s = buildSlides('Luz', FULL_DOC, 'FULL', { 'i1:0': D('Lanterna'), 'a1:0': D('   ') });
    assert.deepEqual(s.filter((x) => x.kind === 'SUMMARY').map((x) => x.id), ['i1:0']);
    assert.deepEqual(buildSlides('Luz', FULL_DOC, 'FULL'), buildSlides('Luz', FULL_DOC, 'VERSES_AND_POINTS'));
  });

  it('decisão de id que não é alvo é ignorada', () => {
    const s = buildSlides('Luz', FULL_DOC, 'FULL', { 'zz:0': D('não'), 'i2:0': D('não'), 'n2:0': D('não') });
    assert.equal(s.some((x) => x.kind === 'SUMMARY'), false);
  });

  it('countSlides.FULL = versículos e pontos + alvos de resumo', () => {
    const c = countSlides('Luz', FULL_DOC);
    assert.equal(c.FULL, c.VERSES_AND_POINTS + 4);
    assert.equal(c.FULL, buildSlides('Luz', FULL_DOC, 'FULL', decisions).filter((x) => x.kind !== 'PRIVATE').length);
  });

  it('M02 num ponto põe o subtítulo; M04 num versículo curto põe o subtítulo e mantém o texto', () => {
    const s = buildSlides('Luz', FULL_DOC, 'FULL', { 'pt1:0': D('Ninguém acha o caminho sozinho'), v1: D('A luz que guia', 'M04') });
    const pt = s.find((x) => x.id === 'pt1:0')!;
    assert.deepEqual([pt.layout, pt.text, pt.subtitle, pt.heading], ['M02', 'A luz chama', 'Ninguém acha o caminho sozinho', null]);
    const v = s.find((x) => x.id === 'v1:0')!;
    assert.deepEqual([v.layout, v.subtitle, v.heading, v.version, v.reference], ['M04', 'A luz que guia', 'Luz', 'BLIVRE', 'João 8:12']);
    assert.equal(v.text, 'Eu sou a luz do mundo; quem me segue não andará em trevas.');
    assert.equal(s.find((x) => x.id === 'v2:0')!.layout, 'M03');
  });

  it('M02 num ponto de mais de 60 caracteres não cabe: fica M01 sem subtítulo', () => {
    const long = Array(8).fill('palavra').join(' ');
    assert.ok(long.length > 60 && long.length <= 75);
    const twelve = 'um dois três quatro cinco seis sete oito nove dez onze doze';
    const s = buildSlides('', doc(point('p', long), para(twelve)), 'FULL', { 'p:0': D('Sub') });
    assert.deepEqual(s.map((x) => [x.id, x.layout, x.subtitle]), [['p:0', 'M01', null]]);
  });

  it('M04 num versículo de 300: <id>:lead em M02 com o subtítulo e os pedaços em M03, nenhum M04', () => {
    const sentence = 'Esta é uma frase de tamanho médio que se repete para encher o texto do versículo longo.';
    const text = [sentence, sentence, sentence].join(' ') + ' Fim do versículo aqui.';
    assert.ok(text.length >= 270 && text.length <= 300);
    const s = buildSlides('Luz', doc(point('p', 'A luz chama'), verseBlock('v', 'João 1:1', [{ number: 1, text }])), 'FULL', { v: D('Liga', 'M04') });
    assert.deepEqual(s.map((x) => [x.id, x.kind, x.layout]), [
      ['title', 'TITLE', 'M01'], ['p:0', 'POINT', 'M01'], ['v:lead', 'SUMMARY', 'M02'], ['v:0', 'VERSE', 'M03'], ['v:1', 'VERSE', 'M03'],
    ]);
    const lead = s.find((x) => x.id === 'v:lead')!;
    assert.deepEqual([lead.text, lead.heading, lead.sourceBlockId], ['Liga', 'A luz chama', 'v']);
    assert.equal(s.some((x) => x.layout === 'M04'), false);
    assert.equal(s.filter((x) => x.kind === 'VERSE').map((x) => x.text).join(' '), text);
    assert.ok(s.filter((x) => x.kind === 'VERSE').every((x) => x.text.length <= 220 && x.subtitle === null));
  });

  it('M04 num bloco de vários versículos curtos: só o primeiro leva o subtítulo', () => {
    const d = doc(verseBlock('v', 'Mateus 5:14-15', [{ number: 14, text: 'Vós sois a luz do mundo.' }, { number: 15, text: 'Nem se acende a candeia.' }]));
    const s = buildSlides('Luz', d, 'FULL', { v: D('Liga', 'M04') });
    assert.deepEqual(s.map((x) => [x.id, x.layout, x.subtitle]), [['title', 'M01', null], ['v:0', 'M04', 'Liga'], ['v:1', 'M03', null]]);
  });

  it('M04 cujo título de contexto não cabe em nenhuma palavra de 45: divide em <id>:lead + M03', () => {
    const word = 'x'.repeat(50);
    const twelve = 'um dois três quatro cinco seis sete oito nove dez onze doze';
    const d = doc(point('p', word), para(twelve), verseBlock('v', 'João 1:1', [{ number: 1, text: 'Curto.' }]));
    const s = buildSlides('', d, 'FULL', { v: D('Liga', 'M04') });
    assert.deepEqual(s.filter((x) => x.sourceBlockId === 'v').map((x) => [x.id, x.layout]), [['v:lead', 'M02'], ['v:0', 'M03']]);
  });

  it('fidelidade: com decisões para todos os versículos, texto e referência de todo VERSE são os do bloco', () => {
    const long = Array(40).fill('Bem-aventurados os mansos.').join(' ');
    const d = doc(
      point('p', 'A luz chama'),
      verseBlock('a', 'João 8:12', [{ number: 12, text: 'Eu sou a luz do mundo.' }]),
      verseBlock('b', 'Mateus 5:5-6', [{ number: 5, text: long }, { number: 6, text: 'Fome e sede de justiça.' }]),
      verseBlock('c', 'Salmos 23', [{ number: null, text: '  O Senhor   é o meu pastor;\nnada me faltará.  ' }]),
    );
    const all: Record<string, AiDecision> = {};
    for (const t of aiTargets(d)) if (t.part === 'VERSE') all[t.id] = D('Texto bíblico reescrito pela IA, que não pode entrar', 'M04');
    assert.deepEqual(Object.keys(all), ['a', 'b', 'c']);
    const full = buildSlides('Luz', d, 'FULL', all).filter((x) => x.kind === 'VERSE');
    const plain = buildSlides('Luz', d, 'VERSES');
    assert.deepEqual(full.map((x) => [x.id, x.text, x.reference]), plain.map((x) => [x.id, x.text, x.reference]));
    const joined = (id: string) => full.filter((x) => x.sourceBlockId === id).map((x) => x.text).join(' ');
    assert.equal(joined('a'), 'Eu sou a luz do mundo.');
    assert.equal(joined('b'), `${long} Fome e sede de justiça.`);
    assert.equal(joined('c'), 'O Senhor é o meu pastor; nada me faltará.');
    assert.equal(JSON.stringify(full.map((x) => [x.text, x.reference])).includes('reescrito'), false);
  });
});

describe('modelos padrão sem IA', () => {
  it('versículos e pontos: TITLE e POINT em M01; VERSE em M03 com o ponto atual (antes do primeiro, o título) e a versão do bloco', () => {
    const s = buildSlides('Luz', EXAMPLE_DOC, 'VERSES_AND_POINTS');
    assert.deepEqual(s.map((x) => [x.id, x.layout, x.heading, x.subtitle, x.version]), [
      ['title', 'M01', null, null, null],
      ['v1:0', 'M03', 'Luz', null, 'BLIVRE'],
      ['pt1:0', 'M01', null, null, null],
      ['v2:0', 'M03', 'A luz chama', null, 'BLIVRE'],
      ['pt2:0', 'M01', null, null, null],
      ['n1:0', 'M01', null, null, null],
    ]);
  });

  it('só versículos: só VERSE em M03, ainda com o título de contexto', () => {
    const s = buildSlides('Luz', EXAMPLE_DOC, 'VERSES').filter((x) => x.kind !== 'PRIVATE');
    assert.deepEqual(s.map((x) => [x.kind, x.layout, x.heading]), [['VERSE', 'M03', 'Luz'], ['VERSE', 'M03', 'A luz chama']]);
  });

  it('sem título da palavra, o versículo antes do primeiro ponto usa a referência do bloco; digitado à mão fica sem versão', () => {
    const s = buildSlides('  ', doc(verseBlock('v', 'Mateus 5:14', [{ number: 14, text: 'Vós sois a luz.' }])), 'VERSES');
    assert.deepEqual([s[0].heading, s[0].version], ['Mateus 5:14', null]);
  });

  it('versículo de 300 em M03 vira dois itens de até 220 cuja junção é o texto', () => {
    const sentence = 'Esta é uma frase de tamanho médio que se repete para encher o texto do versículo longo.';
    const text = [sentence, sentence, sentence].join(' ') + ' Fim do versículo aqui.';
    const s = buildSlides('', doc(verseBlock('v', 'João 1:1', [{ number: 1, text }])), 'VERSES');
    assert.equal(s.length, 2);
    assert.ok(s.every((x) => x.layout === 'M03' && x.text.length <= SLIDE_MODEL_LIMITS.M03.verse));
    assert.equal(s.map((x) => x.text).join(' '), text);
  });

  it('título de contexto de 80 é cortado na última palavra que cabe, com reticências, em até 50', () => {
    const long = Array(10).fill('palavra').join(' ') + 'x';
    assert.equal(long.length, 80);
    const s = buildSlides('', doc(point('p', long), verseBlock('v', 'João 1:1', [{ number: 1, text: 'Curto.' }])), 'VERSES');
    assert.equal(s[0].heading, Array(6).fill('palavra').join(' ') + '…');
    assert.ok(Array.from(s[0].heading!).length <= 50);
  });

  it('os limites são os do manual', () => {
    assert.deepEqual(SLIDE_MODEL_LIMITS, {
      M01: { title: 75 },
      M02: { title: 60, subtitle: 150 },
      M03: { title: 50, verse: 220 },
      M04: { title: 45, subtitle: 90, verse: 160 },
    });
  });
});

describe('slideFace', () => {
  it('os quatro modelos', () => {
    assert.deepEqual(slideFace(item('t', { kind: 'TITLE', text: 'Luz' })), { layout: 'M01', title: 'Luz', subtitle: null, verse: null, reference: null });
    assert.deepEqual(slideFace(item('p:0', { text: 'A luz chama', layout: 'M02', subtitle: 'Antes de procurar' })), {
      layout: 'M02', title: 'A luz chama', subtitle: 'Antes de procurar', verse: null, reference: null,
    });
    assert.deepEqual(slideFace(item('h:0', { kind: 'SUMMARY', text: 'Frase', layout: 'M02', heading: 'Conclusão' })), {
      layout: 'M02', title: 'Conclusão', subtitle: 'Frase', verse: null, reference: null,
    });
    assert.deepEqual(
      slideFace(item('v:0', { kind: 'VERSE', text: 'Eu sou a luz.', reference: 'João 8:12', layout: 'M03', heading: 'A luz chama', version: 'BLIVRE' })),
      { layout: 'M03', title: 'A luz chama', subtitle: null, verse: 'Eu sou a luz.', reference: 'João 8:12 · BLIVRE' },
    );
    assert.deepEqual(
      slideFace(item('v:0', { kind: 'VERSE', text: 'Eu sou a luz.', reference: 'João 8:12', layout: 'M04', heading: 'A luz', subtitle: 'Guia', version: null })),
      { layout: 'M04', title: 'A luz', subtitle: 'Guia', verse: 'Eu sou a luz.', reference: 'João 8:12' },
    );
  });

  it('M02 e M04 sem subtítulo viram M01 e M03', () => {
    assert.equal(slideFace(item('p:0', { layout: 'M02', subtitle: null })).layout, 'M01');
    assert.equal(slideFace(item('v:0', { kind: 'VERSE', reference: 'João 1:1', layout: 'M04', heading: 'X', subtitle: null })).layout, 'M03');
  });

  it('item antigo, sem os campos novos, recebe o padrão do tipo; VERSE usa a referência como título', () => {
    assert.deepEqual(slideFace({ kind: 'VERSE', text: 'Eu sou a luz.', reference: 'João 8:12' }), {
      layout: 'M03', title: 'João 8:12', subtitle: null, verse: 'Eu sou a luz.', reference: 'João 8:12',
    });
    assert.deepEqual(slideFace({ kind: 'POINT', text: 'A luz chama', reference: null }), {
      layout: 'M01', title: 'A luz chama', subtitle: null, verse: null, reference: null,
    });
    assert.deepEqual(slideFace({ kind: 'SUMMARY', text: 'Frase', reference: null }), {
      layout: 'M02', title: '', subtitle: 'Frase', verse: null, reference: null,
    });
  });
});

describe('modelos: mergeSlides, publicSlides e parseStoredSlides', () => {
  it('mergeSlides preserva subtítulo e modelo de item editado; o texto do VERSE vem sempre do novo', () => {
    const prev = [
      item('p:0', { text: 'meu ponto', layout: 'M02', subtitle: 'meu sub', edited: true }),
      item('v:0', { kind: 'VERSE', text: 'TEXTO ANTIGO', reference: 'João 1:1', layout: 'M04', heading: 'X', subtitle: 'liga', edited: true }),
    ];
    const fresh = [
      item('p:0', { text: 'novo ponto' }),
      item('v:0', { kind: 'VERSE', text: 'Texto do bloco.', reference: 'João 1:1', layout: 'M03', heading: 'X' }),
    ];
    const m = mergeSlides(prev, fresh);
    assert.deepEqual(m.map((x) => [x.text, x.layout, x.subtitle, x.edited]), [
      ['meu ponto', 'M02', 'meu sub', true],
      ['Texto do bloco.', 'M04', 'liga', true],
    ]);
  });

  it('publicSlides devolve kind, text e os campos de slideFace (referência com a versão)', () => {
    const items = [
      item('v:0', { kind: 'VERSE', text: 'Eu sou a luz.', reference: 'João 8:12', layout: 'M03', heading: 'Luz', version: 'BLIVRE' }),
      item('p:0', { text: 'A luz chama', layout: 'M02', subtitle: 'Sub' }),
      item('n:0', { kind: 'PRIVATE', included: true }),
    ];
    assert.deepEqual(publicSlides(items), [
      { kind: 'VERSE', text: 'Eu sou a luz.', layout: 'M03', title: 'Luz', subtitle: null, verse: 'Eu sou a luz.', reference: 'João 8:12 · BLIVRE' },
      { kind: 'POINT', text: 'A luz chama', layout: 'M02', title: 'A luz chama', subtitle: 'Sub', verse: null, reference: null },
    ]);
  });

  it('parseStoredSlides aceita a linha gravada antes desta mudança e completa com o padrão do tipo', () => {
    const old = [
      { id: 'title', kind: 'TITLE', sourceBlockId: null, text: 'Luz', reference: null, included: true, edited: false },
      { id: 'v1:0', kind: 'VERSE', sourceBlockId: 'v1', text: 'Eu sou a luz do mundo.', reference: 'João 8:12', included: true, edited: false },
      { id: 'pt1:0', kind: 'POINT', sourceBlockId: 'pt1', text: 'A luz chama', reference: null, included: false, edited: true },
      { id: 'i1:0', kind: 'SUMMARY', sourceBlockId: 'i1', text: 'Lanterna', reference: null, included: true, edited: false },
      { id: 'n1:0', kind: 'PRIVATE', sourceBlockId: 'n1', text: 'nota', reference: null, included: false, edited: false },
    ];
    const s = parseStoredSlides(old);
    assert.deepEqual(s.map((x) => [x.id, x.layout, x.heading, x.subtitle, x.version]), [
      ['title', 'M01', null, null, null],
      ['v1:0', 'M03', null, null, null],
      ['pt1:0', 'M01', null, null, null],
      ['i1:0', 'M02', null, null, null],
      ['n1:0', 'M01', null, null, null],
    ]);
    assert.deepEqual(s.map((x) => [x.text, x.included, x.edited]), old.map((x) => [x.text, x.included, x.edited]));
  });

  it('parseStoredSlides valida os campos novos quando presentes', () => {
    const good = item('p:0', { layout: 'M02', subtitle: 'Sub' });
    assert.deepEqual(parseStoredSlides([good]), [good]);
    assert.deepEqual(parseStoredSlides([{ ...good, layout: 'M09' }]), []);
    assert.deepEqual(parseStoredSlides([{ ...good, subtitle: 3 }]), []);
    assert.deepEqual(parseStoredSlides([{ ...good, heading: {} }]), []);
    assert.deepEqual(parseStoredSlides([{ ...good, version: false }]), []);
    const [m04] = parseStoredSlides([item('v:0', { kind: 'VERSE', reference: 'João 1:1', layout: 'M04', heading: 'X', subtitle: null })]);
    assert.equal(m04.layout, 'M03');
    const [long] = parseStoredSlides([
      item('v:0', { kind: 'VERSE', reference: 'João 1:1', layout: 'M03', heading: 'palavra '.repeat(20).trim(), version: 'V'.repeat(80) }),
    ]);
    assert.ok(Array.from(long.heading!).length <= SLIDE_MODEL_LIMITS.M03.title);
    assert.ok(long.version!.length <= 36);
    const [sub] = parseStoredSlides([item('p:0', { layout: 'M02', subtitle: 's'.repeat(400) })]);
    assert.equal(sub.subtitle!.length, SLIDE_MODEL_LIMITS.M02.subtitle);
  });
});

describe('summaryTargets', () => {
  it('alvos na ordem do documento, com ids, partes e rótulos', () => {
    const t = summaryTargets(FULL_DOC);
    assert.deepEqual(t.map((x) => [x.id, x.sourceBlockId, x.part, x.label]), [
      ['opening:0', null, 'OPENING', 'Abertura'],
      ['i1:0', 'i1', 'ILLUSTRATION', 'Ilustração'],
      ['a1:0', 'a1', 'APPLICATION', 'Aplicação'],
      ['h1:0', 'h1', 'SECTION', 'Conclusão'],
    ]);
  });

  it('abertura junta parágrafos antes da primeira seção, sem versículo; seção junta parágrafos e listas até a próxima', () => {
    const [opening, , , conclusion] = summaryTargets(FULL_DOC);
    assert.equal(opening.text, `${OPENING} Todo mundo já ficou sem luz em casa. A primeira coisa que a gente faz é procurar onde está a vela.`);
    assert.equal(opening.text.includes('Eu sou a luz do mundo'), false);
    assert.equal(conclusion.text, `${CONCLUSION} Lembre disso.`);
  });

  it('nenhum texto contém a anotação "Só para mim"', () => {
    for (const x of summaryTargets(FULL_DOC)) {
      assert.equal(x.text.includes('SEGREDO'), false);
      assert.equal(x.text.includes('Dois minutos nessa história'), false);
    }
  });

  it('ilustração com menos de 6 palavras e abertura/seção com menos de 12 não são alvo; ponto nunca é alvo de resumo', () => {
    const d = doc(
      para('Pouca coisa antes do ponto aqui.'),
      point('p', 'Um ponto com muitas palavras para resumir aqui e ali e acolá também'),
      inner('illustration', 'i', 'um dois três quatro cinco'),
      inner('application', 'a', 'um dois três quatro cinco seis'),
      heading('h', 'Fim'),
      para('um dois três quatro cinco seis sete oito nove dez onze'),
    );
    assert.deepEqual(summaryTargets(d).map((x) => x.id), ['a:0']);
  });

  it('o ponto encerra a abertura e a seção do título', () => {
    const twelve = 'um dois três quatro cinco seis sete oito nove dez onze doze';
    const d = doc(heading('h', 'Começo'), para(twelve), point('p', 'Ponto'), para(twelve));
    const t = summaryTargets(d);
    assert.deepEqual(t.map((x) => [x.id, x.text]), [['h:0', twelve]]);
  });

  it('texto cortado em 6.000 caracteres e no máximo 60 alvos', () => {
    const long = 'palavra '.repeat(1000);
    assert.equal(summaryTargets(doc(para(long)))[0].text.length, 6000);
    const many: SermonBlock[] = [];
    for (let i = 0; i < 70; i++) many.push(inner('application', `a${i}`, 'um dois três quatro cinco seis'));
    const t = summaryTargets(doc(...many));
    assert.equal(t.length, 60);
    assert.equal(t[59].id, 'a59:0');
  });

  it('documento vazio não tem alvos', () => {
    assert.deepEqual(summaryTargets(doc()), []);
  });
});

describe('aiTargets', () => {
  it('resumos + um POINT por ponto com texto + um VERSE por bloco, na ordem do documento', () => {
    const t = aiTargets(FULL_DOC);
    assert.deepEqual(t.map((x) => [x.id, x.sourceBlockId, x.part, x.label]), [
      ['opening:0', null, 'OPENING', 'Abertura'],
      ['v1', 'v1', 'VERSE', 'João 8:12'],
      ['pt1:0', 'pt1', 'POINT', 'A luz chama'],
      ['v2', 'v2', 'VERSE', 'Salmos 119:105'],
      ['i1:0', 'i1', 'ILLUSTRATION', 'Ilustração'],
      ['pt2:0', 'pt2', 'POINT', 'A luz mostra'],
      ['a1:0', 'a1', 'APPLICATION', 'Aplicação'],
      ['h1:0', 'h1', 'SECTION', 'Conclusão'],
    ]);
    const byId = Object.fromEntries(t.map((x) => [x.id, x.text]));
    assert.equal(byId['pt1:0'], 'Antes de a gente procurar, a luz já estava acesa. Ninguém acha o caminho sozinho no escuro.');
    assert.equal(byId['pt2:0'], 'Luz não serve para ser olhada, serve para a gente enxergar o resto.');
    assert.equal(byId.v1, 'Eu sou a luz do mundo; quem me segue não andará em trevas.');
    const summaries = t.filter((x) => !['POINT', 'VERSE'].includes(x.part));
    assert.deepEqual(summaries, summaryTargets(FULL_DOC));
  });

  it('ponto com menos de 12 palavras na seção, ponto vazio e versículo vazio não são alvo', () => {
    const d = doc(
      point('p', 'Ponto curto'),
      para('um dois três quatro cinco seis sete oito nove dez onze'),
      point('e', ''),
      para('um dois três quatro cinco seis sete oito nove dez onze doze'),
      verseBlock('v', 'João 1:1', [{ number: 1, text: '   ' }]),
    );
    assert.deepEqual(aiTargets(d), []);
  });

  it('nenhum alvo leva texto "Só para mim"', () => {
    const d = doc(point('p', 'Ponto'), para('um dois três quatro cinco seis sete oito nove dez onze doze'), inner('privateNote', 'n', SECRET));
    assert.equal(JSON.stringify(aiTargets(d)).includes('SEGREDO'), false);
    assert.equal(JSON.stringify(aiTargets(FULL_DOC)).includes('SEGREDO'), false);
    assert.equal(JSON.stringify(aiTargets(FULL_DOC)).includes('Dois minutos'), false);
  });

  it('no máximo 60 alvos e 6.000 caracteres por alvo', () => {
    const many: SermonBlock[] = [];
    for (let i = 0; i < 70; i++) many.push(verseBlock(`v${i}`, 'João 1:1', [{ number: 1, text: 'palavra '.repeat(1000) }]));
    const t = aiTargets(doc(...many));
    assert.equal(t.length, 60);
    assert.ok(t.every((x) => x.text.length <= 6000));
  });
});

describe('cleanDecisions', () => {
  const targets: AiTarget[] = [
    { id: 'opening:0', sourceBlockId: null, part: 'OPENING', label: 'Abertura', text: 'x' },
    { id: 'i1:0', sourceBlockId: 'i1', part: 'ILLUSTRATION', label: 'Ilustração', text: 'x' },
    { id: 'a1:0', sourceBlockId: 'a1', part: 'APPLICATION', label: 'Aplicação', text: 'x' },
    { id: 'p:0', sourceBlockId: 'p', part: 'POINT', label: 'Ponto', text: 'x' },
    { id: 'q:0', sourceBlockId: 'q', part: 'POINT', label: 'Outro', text: 'x' },
    { id: 'v', sourceBlockId: 'v', part: 'VERSE', label: 'João 1:1', text: 'x' },
    { id: 'w', sourceBlockId: 'w', part: 'VERSE', label: 'João 1:2', text: 'x' },
  ];

  it('modelo permitido por parte; outro valor vira o padrão', () => {
    const r = cleanDecisions(targets, [
      { id: 'opening:0', model: '01', text: 'Abre' },
      { id: 'p:0', model: '03', text: 'Sub' },
      { id: 'q:0', model: '02', text: 'Sub' },
      { id: 'v', model: '02', text: 'Sub' },
      { id: 'w', model: '04', text: 'Liga' },
    ]);
    assert.deepEqual(r, {
      'opening:0': { layout: 'M02', text: 'Abre' },
      'p:0': { layout: 'M01', text: '' },
      'q:0': { layout: 'M02', text: 'Sub' },
      v: { layout: 'M03', text: '' },
      w: { layout: 'M04', text: 'Liga' },
    });
  });

  it('texto vazio: M02 e M04 rebaixam; resumo sem texto é descartado', () => {
    const r = cleanDecisions(targets, [
      { id: 'p:0', model: '02', text: '  ' },
      { id: 'v', model: '04', text: '""' },
      { id: 'i1:0', model: '02', text: '' },
    ]);
    assert.deepEqual(r, { 'p:0': { layout: 'M01', text: '' }, v: { layout: 'M03', text: '' } });
  });

  it('ignora id desconhecido e repetido (fica o primeiro)', () => {
    const r = cleanDecisions(targets, [
      { id: 'zz:0', model: '02', text: 'fora' },
      { id: 'i1:0', model: '02', text: 'primeira' },
      { id: 'i1:0', model: '02', text: 'segunda' },
    ]);
    assert.deepEqual(r, { 'i1:0': { layout: 'M02', text: 'primeira' } });
  });

  it('frase de 300 caracteres vira até 90, cortada num espaço, sem reticências', () => {
    const long = 'palavra '.repeat(40).trim();
    assert.equal(long.length > 300, true);
    const r = cleanDecisions(targets, [{ id: 'a1:0', model: '02', text: long }, { id: 'w', model: '04', text: long }]);
    assert.equal(SUMMARY_MAX, 90);
    for (const d of [r['a1:0'], r.w]) {
      assert.ok(d.text.length <= 90);
      assert.equal(d.text, Array(11).fill('palavra').join(' '));
    }
  });

  it('apara, troca quebras de linha por espaço e tira aspas envolventes', () => {
    const r = cleanDecisions(targets, [
      { id: 'opening:0', model: '02', text: '  "A luz\nchama\r\ntodos"  ' },
      { id: 'i1:0', model: '02', text: '“A lanterna mostra o passo”' },
      { id: 'a1:0', model: '02', text: '"A" e "B"' },
    ]);
    assert.deepEqual(
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.text])),
      { 'opening:0': 'A luz chama todos', 'i1:0': 'A lanterna mostra o passo', 'a1:0': '"A" e "B"' },
    );
  });
});
