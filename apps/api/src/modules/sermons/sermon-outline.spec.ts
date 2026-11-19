import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { OutlineBlock } from './ai/sermon-structurer';
import { validateSermonDocument } from './sermon-document';
import { buildSlides } from './sermon-slides';
import { normalizeListReference } from './sermon-slides.service';
import { buildOutlineDocument, dropTitleHeading, outlineTitle, pastedLines, planOutline, planVerse, type VerseFound } from './sermon-outline';

const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};
const block = (kind: OutlineBlock['kind'], start: number, end: number, text = '', reference = ''): OutlineBlock => ({ kind, start, end, text, reference });

describe('pastedLines', () => {
  it('tira linhas vazias, apara e junta espaços repetidos', () => {
    assert.deepEqual(pastedLines('  A luz \r\n\n\tque  chama\r\rFim  '), ['A luz', 'que chama', 'Fim']);
  });
});

describe('planOutline', () => {
  const lines = ['L1', 'L2', 'L3', 'L4', 'L5'];

  it('linhas que a IA não cobriu viram parágrafo no lugar delas', () => {
    const parts = planOutline(lines, [block('POINT', 2, 2, 'Dois'), block('ILLUSTRATION', 4, 4)]);
    assert.deepEqual(
      parts.map((p) => [p.kind, p.lines]),
      [['PARAGRAPH', ['L1']], ['POINT', ['L2']], ['PARAGRAPH', ['L3']], ['ILLUSTRATION', ['L4']], ['PARAGRAPH', ['L5']]],
    );
  });

  it('descarta parte sobreposta, invertida ou fora do texto, sem perder linha', () => {
    const parts = planOutline(lines, [block('POINT', 1, 2), block('LIST', 2, 3), block('VERSE', 5, 4), block('APPLICATION', 4, 9)]);
    assert.deepEqual(parts.flatMap((p) => p.lines), lines);
    assert.deepEqual(parts.map((p) => p.kind), ['POINT', 'PARAGRAPH']);
  });
});

describe('planVerse', () => {
  it('versículo colado fica com o texto do pregador, sem a referência nem as aspas', () => {
    const plan = planVerse({
      kind: 'VERSE', text: '', reference: 'João 8:12',
      lines: ['João 8:12', '"Eu sou a luz do mundo; quem me segue não andará em trevas."'],
    });
    assert.equal(plan.source, 'PASTED');
    assert.ok(plan.source === 'PASTED');
    assert.equal(plan.text, 'Eu sou a luz do mundo; quem me segue não andará em trevas.');
    assert.equal(plan.reference, 'João 8:12');
    assert.equal(plan.ref?.book, 43);
  });

  it('só a referência (mesmo escrita de outro jeito) vai buscar na Bíblia', () => {
    const plan = planVerse({ kind: 'VERSE', text: '', reference: 'Mateus 5:14', lines: ['(Mt 5.14)'] });
    assert.equal(plan.source, 'LOOKUP');
  });

  it('sem referência reconhecida e sem texto não vira versículo', () => {
    assert.equal(planVerse({ kind: 'VERSE', text: '', reference: 'Livro Nenhum', lines: ['veja lá'] }).source, 'NONE');
  });
});

describe('buildOutlineDocument', () => {
  const lines = [
    'A luz que não se apaga',
    'Introdução',
    'Todos nós já tivemos medo do escuro.',
    '1. A luz chama',
    'Jesus disse: João 8:12',
    'Quando faltou energia na vila, a única vela acesa reuniu todo mundo.',
    'Esta semana, acenda uma luz:',
    '- ore por um vizinho',
    '- visite alguém sozinho',
    'Mateus 5:14',
  ];
  const blocks = [
    block('HEADING', 2, 2, 'Introdução'),
    block('POINT', 4, 4, 'A luz chama'),
    block('VERSE', 5, 5, '', 'João 8:12'),
    block('ILLUSTRATION', 6, 6),
    block('APPLICATION', 7, 7),
    block('LIST', 8, 9),
    block('VERSE', 10, 10, '', 'Mateus 5:14'),
  ];

  it('monta um documento válido com cada parte no bloco certo e o texto colado intacto', () => {
    const parts = planOutline(lines, blocks);
    const found: VerseFound = { reference: 'Mateus 5:14', translation: 'BLIVRE', verses: [{ number: 14, text: 'Vós sois a luz do mundo.' }] };
    const verses = new Map<number, VerseFound>();
    parts.forEach((p, i) => {
      if (p.kind === 'VERSE' && p.reference === 'Mateus 5:14') verses.set(i, found);
      if (p.kind === 'VERSE' && p.reference === 'João 8:12') verses.set(i, null);
    });
    const doc = validateSermonDocument(buildOutlineDocument(parts, verses, ids()));
    assert.deepEqual(
      doc.content.map((b) => b.type),
      ['paragraph', 'heading', 'paragraph', 'point', 'paragraph', 'verse', 'illustration', 'application', 'bulletList', 'verse'],
    );
    const point = doc.content[3] as { content: { text: string }[] };
    assert.equal(point.content[0].text, 'A luz chama');
    // João 8:12 sem a Bíblia: bloco só com a referência, sem inventar texto.
    const said = doc.content[4] as { content: { text: string }[] };
    assert.equal(said.content[0].text, 'Jesus disse:');
    const john = doc.content[5] as { attrs: { reference: string; verses: unknown[]; translation: string | null; book: number } };
    assert.equal(john.attrs.reference, 'João 8:12');
    assert.equal(john.attrs.book, 43);
    assert.deepEqual(john.attrs.verses, []);
    assert.equal(john.attrs.translation, null);
    const matthew = doc.content[9] as { attrs: { translation: string; verses: { text: string }[] } };
    assert.equal(matthew.attrs.translation, 'BLIVRE');
    assert.equal(matthew.attrs.verses[0].text, 'Vós sois a luz do mundo.');
    const list = doc.content[8] as { content: { content: { content: { text: string }[] }[] }[] };
    assert.deepEqual(list.content.map((li) => li.content[0].content[0].text), ['ore por um vizinho', 'visite alguém sozinho']);
    assert.equal(new Set(JSON.stringify(doc).match(/id-\d+/g)).size, 6);
  });

  it('linhas a mais num Ponto continuam como texto depois dele', () => {
    const doc = buildOutlineDocument(planOutline(['1. A luz chama', 'Ela chama todos.'], [block('POINT', 1, 2, 'A luz chama')]), new Map(), ids());
    assert.deepEqual(doc.content.map((b) => b.type), ['point', 'paragraph']);
  });

  it('nada colado vira o documento vazio', () => {
    assert.deepEqual(buildOutlineDocument([], new Map(), ids()), { type: 'doc', content: [{ type: 'paragraph' }] });
  });
});

describe('outlineTitle', () => {
  const parts = planOutline(['1. A luz chama'], [block('POINT', 1, 1, 'A luz chama')]);
  it('usa o título da IA, senão o primeiro título ou ponto, senão "Sem título"', () => {
    assert.equal(outlineTitle('  Luz   que guia ', parts), 'Luz que guia');
    assert.equal(outlineTitle('', parts), 'A luz chama');
    assert.equal(outlineTitle('', []), 'Sem título');
    assert.equal(outlineTitle('x'.repeat(300), []).length, 255);
  });
});

describe('exemplo colado: "A agenda Profética está em Curso"', () => {
  // O texto como o pregador colou (organizado por "SLIDES nn") e a divisão que a IA devolveria para ele.
  const text = readFileSync(join(__dirname, 'fixtures/agenda-profetica-colado.txt'), 'utf8');
  const title = 'A agenda Profética está em Curso';
  const point = (line: number, t: string) => block('POINT', line, line, t);
  const verse = (line: number, ref: string) => block('VERSE', line, line, '', ref);
  const blocks = [
    block('HEADING', 1, 1, title),
    verse(2, 'Isaías 46:10'),
    block('LIST', 3, 9),
    point(10, 'Uma Agenda de Poder'), verse(11, '1 Coríntios 1:18'),
    point(12, 'Uma Agenda Guiada pelo Espírito Santo'), verse(13, '1 Coríntios 2:13'),
    point(14, 'Uma Agenda de Fé'), verse(15, 'Mateus 7:9'), verse(16, 'Mateus 7:11'),
    point(17, 'Um Agenda para Reinar em Vida'), verse(18, 'Romanos 5:17'),
    point(19, 'Uma Agenda que vai abalar tudo mais uma vez'), verse(20, 'Ageu 2:6'), verse(21, 'Isaías 13:13'),
    point(22, 'Uma Agenda de Tranferência de Riquezas'), verse(23, 'Deuteronômio 8:17'), verse(24, 'Deuteronômio 8:18'),
    point(25, 'Uma Agenda de Troca de Guarda'), block('LIST', 26, 28), verse(29, 'Salmos 101:6'),
  ];

  it('vira o esboço e os 13 slides do exemplo aprovado, com o texto colado sem a referência da ponta', () => {
    const lines = pastedLines(text);
    const parts = dropTitleHeading(planOutline(lines, blocks), title);
    const doc = validateSermonDocument(buildOutlineDocument(parts, new Map(), ids()));
    const slides = buildSlides(outlineTitle(title, parts), doc, 'VERSES_AND_POINTS', normalizeListReference);
    assert.equal(slides.length, 13);
    assert.deepEqual(
      slides.map((s) => s.reference ?? s.layout),
      ['Isaías 46:10', 'NUMBERED', '1 Coríntios 1:18', '1 Coríntios 2:13', 'Mateus 7:9', 'Mateus 7:11', 'Romanos 5:17', 'Ageu 2:6',
        'Isaías 13:13', 'Deuteronômio 8:17', 'Deuteronômio 8:18', 'BULLETS', 'Salmos 101:6'],
    );
    assert.equal(slides[0].heading, title);
    assert.equal(slides[2].heading, '1. Uma Agenda de Poder');
    assert.equal(slides[2].text, 'A palavra da cruz é loucura para os que perecem; mas para nós, que somos salvos, é o poder de Deus.');
    assert.equal(slides[0].text.endsWith('farei toda a minha vontade.'), true);
    // A aspa solta do começo sai, como no slide aprovado.
    assert.equal(slides[4].text, 'Qual de vocês, se seu filho pedir pão, lhe dará uma pedra?');
    assert.deepEqual(slides[11].items, [
      'Deus visitou José em sonhos: ele sustentaria Israel no Egito (Gênesis 37:5)',
      'Deus visitou Moises em visão na sarça ardente: (Êxodo 3:2)',
      'Deus visitou Salomão em sonho: pede-me... (1 Reis 3:5)',
    ]);
  });
});
