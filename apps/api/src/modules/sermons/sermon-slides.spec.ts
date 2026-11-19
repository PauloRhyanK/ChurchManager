import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLE_DOC } from './sermon-example';
import type { SermonBlock, SermonDoc } from './sermon-document';
import { normalizeListReference } from './sermon-slides.service';
import {
  PANEL,
  buildSlides,
  countSlides,
  listHeight,
  mergeSlides,
  panelSpace,
  parseStoredSlides,
  publicSlides,
  readSlideMode,
  slideFace,
  splitListToFit,
  splitVerseToFit,
  stripPointNumber,
  titleLines,
  verseLines,
  verseLinesAvailable,
  wrapLines,
  type SlideItem,
  typographicQuotes,
} from './sermon-slides';

const verseBlock = (id: string, reference: string, verses: { number: number | null; text: string }[]): SermonBlock => ({
  type: 'verse',
  attrs: { id, reference, book: null, chapter: null, verseStart: null, verseEnd: null, translation: null, verses },
});
const doc = (...content: SermonBlock[]): SermonDoc => ({ type: 'doc', content });
const point = (id: string, text: string): SermonBlock => ({ type: 'point', attrs: { id }, content: text ? [{ type: 'text', text }] : [] });
const para = (text: string): SermonBlock => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const heading = (id: string, text: string): SermonBlock => ({ type: 'heading', attrs: { id, level: 2 }, content: [{ type: 'text', text }] });
const bullets = (...items: string[]): SermonBlock => ({
  type: 'bulletList',
  content: items.map((text) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })),
});
const item = (id: string, over: Partial<SlideItem> = {}): SlideItem => ({
  id,
  kind: 'POINT',
  sourceBlockId: id.split(':')[0],
  text: `texto ${id}`,
  reference: null,
  included: true,
  edited: false,
  layout: 'TITLE',
  heading: null,
  items: null,
  start: null,
  version: null,
  ...over,
});
const shape = (s: SlideItem[]) => s.map((x) => [x.kind, x.layout, x.heading ?? x.text, x.reference]);

// ---- O exemplo aprovado: "A agenda Profética está em Curso" (13 slides) -----------------------------------------

const TITLE = 'A agenda Profética está em Curso';
const TOPICS = [
  'Uma Agenda de Poder',
  'Uma Agenda Guiada pelo Espírito Santo',
  'Uma Agenda de Fé',
  'Um Agenda para Reinar em Vida',
  'Uma Agenda que vai abalar tudo mais uma vez',
  'Uma Agenda de Tranferência de Riquezas',
  'Uma Agenda de Troca de Guarda',
];
const v = (id: string, reference: string, number: number, text: string) => verseBlock(id, reference, [{ number, text }]);
/** O que o "Colar texto" monta do texto que o pregador colou. */
const AGENDA: SermonDoc = doc(
  v('is46', 'Isaías 46:10', 10, 'Que anuncio o fim desde o princípio, e desde a antiguidade as coisas que ainda não sucederam; que digo: O meu conselho será firme, e farei toda a minha vontade.'),
  bullets(...TOPICS),
  point('p1', TOPICS[0]),
  v('co1', '1 Coríntios 1:18', 18, 'A palavra da cruz é loucura para os que perecem; mas para nós, que somos salvos, é o poder de Deus.'),
  point('p2', TOPICS[1]),
  v('co2', '1 Coríntios 2:13', 13, 'As quais também falamos, não com palavras que a sabedoria humana ensina, mas com as que o Espírito Santo ensina, comparando as coisas espirituais com as espirituais.'),
  point('p3', `3. ${TOPICS[2]} `), // numeração escrita pelo pregador: sai antes de numerar de novo
  v('mt9', 'Mateus 7:9', 9, '"Qual de vocês, se seu filho pedir pão, lhe dará uma pedra?'),
  v('mt11', 'Mateus 7:11', 11, 'Se vocês, apesar de serem maus, sabem dar boas coisas aos seus filhos, quanto mais o Pai de vocês, que está nos céus, dará coisas boas aos que lhe pedirem!'),
  point('p4', TOPICS[3]),
  v('rm', 'Romanos 5:17', 17, 'Porque, se pela ofensa de um só, a morte reinou por esse, muito mais os que recebem a abundância da graça, e do dom da justiça, reinarão em vida por um só, Jesus Cristo.'),
  point('p5', TOPICS[4]),
  v('ag', 'Ageu 2:6', 6, 'Porque assim diz o Senhor dos Exércitos: Ainda uma vez, daqui a pouco, farei tremer os céus e a terra, o mar e a terra seca;'),
  v('is13', 'Isaías 13:13', 13, 'Por isso farei estremecer os céus; e a terra se moverá do seu lugar, por causa do furor do Senhor dos Exércitos, e por causa do dia da sua ardente ira.'),
  point('p6', TOPICS[5]),
  v('dt17', 'Deuteronômio 8:17', 17, 'Não digam, pois, em seu coração: "A minha capacidade e a força das minhas mãos ajuntaram para mim toda esta riqueza".'),
  para(''),
  v('dt18', 'Deuteronômio 8:18', 18, 'Mas, lembrem-se do Senhor, do seu Deus, pois é ele que lhes dá a capacidade de produzir riqueza, confirmando a aliança que jurou aos seus antepassados, conforme hoje se vê.'),
  point('p7', TOPICS[6]),
  bullets(
    'Deus visitou José em sonhos: ele sustentaria Israel no Egito (Gn 37:5)',
    'Deus visitou Moises em visão na sarça ardente: (Ex 3:2)',
    'Deus visitou Salomão em sonho: pede-me... (l Reis 3.5)',
  ),
  v('sl', 'Salmos 101:6', 6, 'Meus olhos aprovam os fiéis da terra, e eles habitarão comigo. Somente quem tem vida íntegra me servirá.'),
);
const H = (n: number) => `${n}. ${TOPICS[n - 1]}`;

describe('o exemplo aprovado', () => {
  it('"Com versículos": capa com Isaías 46:10, visão geral dos 7 pontos e um slide por versículo e por lista = 13', () => {
    const s = buildSlides(TITLE, AGENDA, 'VERSES_AND_POINTS', normalizeListReference);
    assert.deepEqual(
      s.map((x) => [x.kind, x.layout, x.heading, x.reference]),
      [
        ['VERSE', 'VERSE', TITLE, 'Isaías 46:10'],
        ['SUMMARY', 'NUMBERED', TITLE, null],
        ['VERSE', 'VERSE', H(1), '1 Coríntios 1:18'],
        ['VERSE', 'VERSE', H(2), '1 Coríntios 2:13'],
        ['VERSE', 'VERSE', H(3), 'Mateus 7:9'],
        ['VERSE', 'VERSE', H(3), 'Mateus 7:11'],
        ['VERSE', 'VERSE', H(4), 'Romanos 5:17'],
        ['VERSE', 'VERSE', H(5), 'Ageu 2:6'],
        ['VERSE', 'VERSE', H(5), 'Isaías 13:13'],
        ['VERSE', 'VERSE', H(6), 'Deuteronômio 8:17'],
        ['VERSE', 'VERSE', H(6), 'Deuteronômio 8:18'],
        ['SUMMARY', 'BULLETS', H(7), null],
        ['VERSE', 'VERSE', H(7), 'Salmos 101:6'],
      ],
    );
    assert.deepEqual(s.map((x) => x.id), [
      'is46:0', 'overview', 'co1:0', 'co2:0', 'mt9:0', 'mt11:0', 'rm:0', 'ag:0', 'is13:0', 'dt17:0', 'dt18:0', 'list:p7:0:0', 'sl:0',
    ]);
    const overview = s[1];
    assert.deepEqual(overview.items, TOPICS);
    assert.equal(overview.text, TOPICS.join('\n'));
    assert.equal(overview.start, 1);
    assert.deepEqual(s[11].items, [
      'Deus visitou José em sonhos: ele sustentaria Israel no Egito (Gênesis 37:5)',
      'Deus visitou Moises em visão na sarça ardente: (Êxodo 3:2)',
      'Deus visitou Salomão em sonho: pede-me... (1 Reis 3:5)',
    ]);
    // Nenhum versículo foi dividido: o texto de cada slide é o versículo inteiro.
    assert.equal(s[0].text.startsWith('Que anuncio') && s[0].text.endsWith('minha vontade.'), true);
    assert.equal(s[8].text.endsWith('ardente ira.'), true);
  });

  it('"Só títulos": capa, visão geral e um slide com o título de cada ponto = 9', () => {
    const s = buildSlides(TITLE, AGENDA, 'TITLES', normalizeListReference);
    assert.deepEqual(shape(s), [
      ['TITLE', 'TITLE', TITLE, null],
      ['SUMMARY', 'NUMBERED', TITLE, null],
      ...TOPICS.map((_, i) => ['POINT', 'TITLE', H(i + 1), null]),
    ]);
    assert.deepEqual(s.map((x) => x.id).slice(0, 3), ['title', 'overview', 'p1:title']);
    assert.deepEqual(countSlides(TITLE, AGENDA), { VERSES_AND_POINTS: 13, TITLES: 9 });
  });

  it('sem normalizeRef (contagem no painel), os itens ficam como foram escritos', () => {
    const list = buildSlides(TITLE, AGENDA, 'VERSES_AND_POINTS').find((x) => x.layout === 'BULLETS')!;
    assert.equal(list.items![0], 'Deus visitou José em sonhos: ele sustentaria Israel no Egito (Gn 37:5)');
  });
});

// ---- Regras do gerador -------------------------------------------------------------------------------------------

describe('buildSlides', () => {
  it('exemplo do editor: capa com o versículo de abertura, visão geral, versículo do ponto 1 e o ponto 2 só com título', () => {
    const s = buildSlides('Luz', EXAMPLE_DOC, 'VERSES_AND_POINTS');
    assert.deepEqual(s.map((x) => [x.id, x.kind, x.layout, x.heading ?? x.text]), [
      ['v1:0', 'VERSE', 'VERSE', 'Luz'],
      ['overview', 'SUMMARY', 'NUMBERED', 'Luz'],
      ['v2:0', 'VERSE', 'VERSE', '1. A luz chama'],
      ['pt2:title', 'POINT', 'TITLE', '2. A luz mostra'],
      ['n1:0', 'PRIVATE', 'TITLE', `${'Dois minutos nessa história, não mais. Olhar para o lado esquerdo do templo.'.slice(0, 80)}`],
    ]);
    assert.equal(s[4].included, false);
    assert.equal(s[0].reference, 'João 8:12', 'a referência não leva mais a tradução');
    assert.equal(s[0].version, 'BLIVRE', 'a tradução continua guardada');
    assert.deepEqual(buildSlides('Luz', EXAMPLE_DOC, 'TITLES').map((x) => x.id), ['title', 'overview', 'pt1:title', 'pt2:title', 'n1:0']);
  });

  it('com um ponto só não há visão geral; a lista da abertura vira slide', () => {
    const d = doc(bullets('a (Gn 1:1)', 'b'), point('p', 'Único'));
    const s = buildSlides('T', d, 'VERSES_AND_POINTS', normalizeListReference);
    assert.deepEqual(s.map((x) => [x.id, x.layout, x.heading ?? x.text]), [
      ['title', 'TITLE', 'T'],
      ['list:opening:0:0', 'BULLETS', 'T'],
      ['p:title', 'TITLE', '1. Único'],
    ]);
    assert.deepEqual(s[1].items, ['a (Gênesis 1:1)', 'b']);
    assert.equal(s[1].text, 'a (Gênesis 1:1)\nb');
  });

  it('título de seção abre um contexto sem número; ilustração, aplicação e parágrafo não geram slide', () => {
    const d = doc(point('p1', 'Um'), heading('h', 'Conclusão'), verseBlock('v', 'João 3:16', [{ number: 16, text: 'Porque Deus amou.' }]), point('p2', 'Dois'), para('fala'));
    const s = buildSlides('', d, 'VERSES_AND_POINTS');
    assert.deepEqual(s.map((x) => [x.id, x.heading ?? x.text]), [
      ['overview', 'Um\nDois'], // heading nulo: cai no texto
      ['p1:title', '1. Um'],
      ['v:0', 'Conclusão'],
      ['p2:title', '2. Dois'],
    ]);
    assert.equal(s[0].heading, null, 'sem título da palavra, a visão geral fica sem título');
    assert.equal(s.some((x) => x.kind === 'TITLE'), false, 'sem título, sem capa');
  });

  it('versículo com número usa "Livro c:v"; sem número usa a referência do bloco; vazio não gera slide', () => {
    const d = doc(verseBlock('v', 'Mateus 5:14-16', [{ number: 14, text: 'Vós sois a luz.' }, { number: null, text: 'livre' }, { number: 15, text: '  ' }]));
    const s = buildSlides('', d, 'VERSES_AND_POINTS');
    assert.deepEqual(s.map((x) => [x.id, x.reference]), [['v:0', 'Mateus 5:14'], ['v:1', 'Mateus 5:14-16']]);
    assert.equal(s[0].heading, null);
    assert.equal(slideFace(s[0]).title, 'Mateus 5:14', 'sem título de contexto, o título do slide é a referência');
  });

  it('versículo que não cabe é dividido em fronteira de frase; todos os pedaços com a mesma referência e o mesmo título', () => {
    const sentence = 'Esta frase do versículo tem palavras suficientes para ocupar uma linha inteira.';
    const text = Array(6).fill(sentence).join(' ');
    const s = buildSlides('', doc(point('p', 'Curto'), verseBlock('v', 'João 1:1', [{ number: 1, text }])), 'VERSES_AND_POINTS');
    const pieces = s.filter((x) => x.kind === 'VERSE');
    assert.ok(pieces.length >= 2);
    assert.equal(pieces.map((x) => x.text).join(' '), text);
    for (const x of pieces) {
      assert.ok(verseLines(x.text) <= verseLinesAvailable('1. Curto'));
      assert.ok(x.text.endsWith('.'), 'corta depois do ponto final');
      assert.deepEqual([x.reference, x.heading], ['João 1:1', '1. Curto']);
    }
    assert.deepEqual(pieces.map((x) => x.id), pieces.map((_, i) => `v:${i}`));
  });

  it('lista que não cabe é dividida entre itens, com o mesmo título', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Item número ${i + 1} da lista do ponto`);
    const s = buildSlides('', doc(point('p', 'Lista'), bullets(...many)), 'VERSES_AND_POINTS');
    assert.ok(s.length >= 2);
    assert.deepEqual(s.map((x) => x.id), s.map((_, n) => `list:p:0:${n}`));
    assert.deepEqual(s.flatMap((x) => x.items!), many);
    for (const x of s) {
      assert.equal(x.heading, '1. Lista');
      assert.ok(listHeight(x.items!, 'BULLETS') <= panelSpace('1. Lista'));
    }
  });

  it('visão geral dividida continua a numeração', () => {
    const d = doc(...Array.from({ length: 12 }, (_, i) => point(`p${i}`, `Ponto número ${i + 1}`)));
    const s = buildSlides('Um título bem comprido que ocupa duas linhas', d, 'TITLES').filter((x) => x.kind === 'SUMMARY');
    assert.ok(s.length >= 2);
    assert.deepEqual(s.map((x) => x.id), s.map((_, n) => (n === 0 ? 'overview' : `overview:${n}`)));
    assert.equal(s[1].start, s[0].items!.length + 1);
    assert.equal(s.flatMap((x) => x.items!).length, 12);
  });

  it('"Só títulos" ignora versículos e listas; documento vazio só tem a capa', () => {
    const d = doc(verseBlock('v', 'João 1:1', [{ number: 1, text: 'No princípio.' }]), point('p', 'Um'), bullets('a'));
    assert.deepEqual(buildSlides('T', d, 'TITLES').map((x) => x.id), ['title', 'p:title']);
    assert.deepEqual(buildSlides('T', doc(), 'VERSES_AND_POINTS').map((x) => x.kind), ['TITLE']);
    assert.deepEqual(buildSlides('', doc(), 'VERSES_AND_POINTS'), []);
  });

  it('ponto vazio e nota vazia não geram item; nota de 200 vira rótulo de 80', () => {
    const empty: SermonBlock = { type: 'privateNote', attrs: { id: 'n' }, content: [{ type: 'paragraph' }] };
    assert.deepEqual(buildSlides('', doc(point('p', ''), empty), 'VERSES_AND_POINTS'), []);
    const note: SermonBlock = { type: 'privateNote', attrs: { id: 'n' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'y'.repeat(200) }] }] };
    assert.equal(buildSlides('', doc(note), 'VERSES_AND_POINTS')[0].text, 'y'.repeat(80) + '…');
  });
});

describe('stripPointNumber', () => {
  it('tira a numeração escrita pelo pregador', () => {
    for (const raw of ['1. Fé', '1) Fé', '12 – Fé', 'I – Fé', 'IV. Fé', 'Ponto 1: Fé', 'ponto 2 Fé', '  3.Fé ']) assert.equal(stripPointNumber(raw), 'Fé', raw);
    for (const keep of ['Imagine a fé', '3 coisas da fé', 'Fé']) assert.equal(stripPointNumber(keep), keep);
  });
});

// ---- Caber -------------------------------------------------------------------------------------------------------

describe('medidas e encaixe', () => {
  it('área útil e painel do manual', () => {
    assert.equal(PANEL.area.width, PANEL.canvas.width - 2 * PANEL.margin.x);
    assert.equal(PANEL.area.height, PANEL.canvas.height - 2 * PANEL.margin.y);
    assert.equal(PANEL.panel.innerWidth, PANEL.panel.width - 2 * PANEL.panel.padX);
    assert.equal(PANEL.panel.x, (PANEL.canvas.width - PANEL.panel.width) / 2);
    assert.equal(PANEL.header, 2 * PANEL.rule.gap + PANEL.rule.height);
  });

  it('título de 1 linha deixa 5 linhas de versículo; de 2 linhas, 4; nunca menos de 2', () => {
    assert.equal(titleLines('1. Uma Agenda de Poder'), 1);
    assert.equal(titleLines(TITLE), 2);
    assert.equal(verseLinesAvailable('1. Uma Agenda de Poder'), 5);
    assert.equal(verseLinesAvailable(TITLE), 4);
    assert.equal(verseLinesAvailable('palavra '.repeat(40)), PANEL.minLines);
  });

  it('wrapLines quebra em palavra inteira e corta palavra maior que a linha', () => {
    assert.deepEqual(wrapLines('aa bb cc', 5), ['aa bb', 'cc']);
    assert.deepEqual(wrapLines('abcdefgh ij', 3), ['abc', 'def', 'gh', 'ij']);
    assert.deepEqual(wrapLines('   ', 10), []);
  });

  it('splitVerseToFit: frase, depois vírgula, depois palavra', () => {
    const line = 'x'.repeat(40);
    assert.deepEqual(splitVerseToFit(`${line}. ${line}. ${line}`, 2), [`${line}. ${line}.`, line]);
    assert.deepEqual(splitVerseToFit(`${line}, ${line} ${line}`, 2), [`${line},`, `${line} ${line}`]);
    const words = Array(30).fill('abc').join(' ');
    const pieces = splitVerseToFit(words, 2);
    assert.equal(pieces.join(' '), words);
    assert.ok(pieces.every((p) => verseLines(p) <= 2));
    assert.deepEqual(splitVerseToFit('curto', 2), ['curto']);
  });

  it('splitListToFit: item que sozinho não cabe vai inteiro num grupo', () => {
    const huge = 'palavra '.repeat(200).trim();
    assert.deepEqual(splitListToFit(['a', huge, 'b'], 'BULLETS', 'T'), [['a'], [huge], ['b']]);
    assert.deepEqual(splitListToFit(['a', 'b'], 'NUMBERED', 'T'), [['a', 'b']]);
  });
});

// ---- Face, envio, merge e leitura --------------------------------------------------------------------------------

describe('slideFace e publicSlides', () => {
  it('cada tipo de slide', () => {
    assert.deepEqual(slideFace(item('title', { kind: 'TITLE', text: 'Luz' })), { layout: 'TITLE', title: 'Luz', verse: null, reference: null, items: null, start: null });
    assert.deepEqual(slideFace(item('v:0', { kind: 'VERSE', text: 'Eu sou a luz.', reference: 'João 8:12', layout: 'VERSE', heading: '1. A luz', version: 'BLIVRE' })), {
      layout: 'VERSE', title: '1. A luz', verse: 'Eu sou a luz.', reference: 'João 8:12', items: null, start: null,
    });
    assert.deepEqual(slideFace(item('overview', { kind: 'SUMMARY', text: 'a\nb', layout: 'NUMBERED', heading: 'Luz', items: ['a', 'b'], start: 3 })), {
      layout: 'NUMBERED', title: 'Luz', verse: null, reference: null, items: ['a', 'b'], start: 3,
    });
    assert.deepEqual(slideFace({ kind: 'SUMMARY', text: 'Frase antiga', reference: null }), {
      layout: 'BULLETS', title: '', verse: null, reference: null, items: ['Frase antiga'], start: null,
    });
    assert.deepEqual(slideFace({ kind: 'VERSE', text: 'Eu sou a luz.', reference: 'João 8:12' }).title, 'João 8:12');
  });

  it('publicSlides: só marcados e não privados, com kind, text e a face; SUMMARY leva os itens em text', () => {
    const pub = publicSlides([
      item('v:0', { kind: 'VERSE', text: 'Eu sou a luz.', reference: 'João 8:12', layout: 'VERSE', heading: 'Luz', version: 'BLIVRE' }),
      item('l', { kind: 'SUMMARY', text: 'a\nb', layout: 'BULLETS', heading: 'H', items: ['a', 'b'] }),
      item('p:title', { included: false }),
      item('n:0', { kind: 'PRIVATE', included: true }),
    ]);
    assert.deepEqual(pub, [
      { kind: 'VERSE', text: 'Eu sou a luz.', layout: 'VERSE', title: 'Luz', verse: 'Eu sou a luz.', reference: 'João 8:12', items: null, start: null },
      { kind: 'SUMMARY', text: 'a\nb', layout: 'BULLETS', title: 'H', verse: null, reference: null, items: ['a', 'b'], start: null },
    ]);
  });
});

describe('mergeSlides', () => {
  it('mantém included pelo id e o texto editado só em TITLE e POINT', () => {
    const prev = [
      item('title', { kind: 'TITLE', text: 'Meu título', edited: true }),
      item('p:title', { text: 'Meu ponto', edited: true, included: false }),
      item('v:0', { kind: 'VERSE', text: 'antigo', edited: true, reference: 'João 1:1', layout: 'VERSE' }),
      item('overview', { kind: 'SUMMARY', text: 'velho', edited: true, layout: 'NUMBERED', items: ['velho'], start: 1 }),
    ];
    const fresh = [
      item('title', { kind: 'TITLE', text: 'Luz' }),
      item('p:title', { text: '1. Novo' }),
      item('v:0', { kind: 'VERSE', text: 'do bloco', reference: 'João 1:1', layout: 'VERSE' }),
      item('overview', { kind: 'SUMMARY', text: 'novo', layout: 'NUMBERED', items: ['novo'], start: 1 }),
    ];
    const m = mergeSlides(prev, fresh);
    assert.deepEqual(m.map((x) => [x.id, x.text, x.edited, x.included]), [
      ['title', 'Meu título', true, true],
      ['p:title', 'Meu ponto', true, false],
      ['v:0', 'do bloco', false, true],
      ['overview', 'novo', false, true],
    ]);
  });

  it('texto editado acima de 120 não volta; slide novo entra depois do vizinho; privado no fim e desmarcado', () => {
    const m = mergeSlides(
      [item('b:title', { text: 'x'.repeat(121), edited: true }), item('n:0', { kind: 'PRIVATE', included: false })],
      [item('a:title'), item('b:title'), item('n:0', { kind: 'PRIVATE', included: false })],
    );
    assert.deepEqual(m.map((x) => [x.id, x.text.length > 100]), [['a:title', false], ['b:title', false], ['n:0', false]]);
    assert.equal(m[2].included, false);
  });
});

describe('parseStoredSlides', () => {
  it('lê o formato novo como foi gravado', () => {
    const good = [
      item('overview', { kind: 'SUMMARY', text: 'a\nb', layout: 'NUMBERED', heading: 'Luz', items: ['a', 'b'], start: 1, sourceBlockId: null }),
      item('v:0', { kind: 'VERSE', text: 'T', reference: 'João 1:1', layout: 'VERSE', heading: 'H', version: 'BLIVRE' }),
    ];
    assert.deepEqual(parseStoredSlides(good), good);
  });

  it('aceita linhas antigas: M01–M04 e subtitle; SUMMARY vira lista de um item; heading que falta vira a referência', () => {
    const old = [
      { id: 'title', kind: 'TITLE', sourceBlockId: null, text: 'Luz', reference: null, included: true, edited: false, subtitleEdited: false, layout: 'M01', heading: null, subtitle: null, version: null },
      { id: 'p:0', kind: 'POINT', sourceBlockId: 'p', text: 'A luz', reference: null, included: false, edited: true, layout: 'M02', heading: null, subtitle: 'Sub', version: null },
      { id: 'v:0', kind: 'VERSE', sourceBlockId: 'v', text: 'Eu sou.', reference: 'João 8:12', included: true, edited: false, layout: 'M04', subtitle: 'Liga', version: 'BLIVRE' },
      { id: 'i:0', kind: 'SUMMARY', sourceBlockId: 'i', text: 'Frase', reference: null, included: true, edited: false, layout: 'M02', heading: 'Conclusão', subtitle: null, version: null },
      { id: 'n:0', kind: 'PRIVATE', sourceBlockId: 'n', text: 'nota', reference: null, included: true, edited: false },
    ];
    const s = parseStoredSlides(old);
    assert.deepEqual(s.map((x) => [x.id, x.layout, x.heading, x.items, x.included]), [
      ['title', 'TITLE', null, null, true],
      ['p:0', 'TITLE', null, null, false],
      ['v:0', 'VERSE', 'João 8:12', null, true],
      ['i:0', 'BULLETS', 'Conclusão', ['Frase'], true],
      ['n:0', 'TITLE', null, null, false],
    ]);
    assert.equal(s.some((x) => 'subtitle' in x || 'subtitleEdited' in x), false);
  });

  it('descarta o que está fora do formato e ids repetidos', () => {
    const good = item('p:title');
    assert.deepEqual(parseStoredSlides([{ ...good, kind: 'OUTRO' }, { ...good, heading: 3 }, good, good, null, 'x']), [good]);
    assert.deepEqual(parseStoredSlides('não é lista'), []);
  });
});

describe('readSlideMode', () => {
  it('VERSES e FULL antigos valem como VERSES_AND_POINTS', () => {
    assert.deepEqual(['VERSES', 'FULL', 'VERSES_AND_POINTS', 'TITLES', null].map((m) => readSlideMode(m as never)), [
      'VERSES_AND_POINTS', 'VERSES_AND_POINTS', 'VERSES_AND_POINTS', 'TITLES', null,
    ]);
  });
});

describe('texto no slide', () => {
  it('aspas retas viram tipográficas, inclusive o apóstrofo', () => {
    assert.equal(typographicQuotes('Não digam: "A minha força". E disse: "Qual'), 'Não digam: “A minha força”. E disse: “Qual');
    assert.equal(typographicQuotes("d'água e 'isso'"), 'd’água e ‘isso’');
  });

  it('referência curta entre parênteses não quebra no meio da linha', () => {
    assert.deepEqual(wrapLines('Deus visitou Salomão em sonho: pede-me... (1 Reis 3:5)', 48), [
      'Deus visitou Salomão em sonho: pede-me...',
      '(1 Reis 3:5)',
    ]);
  });
});
