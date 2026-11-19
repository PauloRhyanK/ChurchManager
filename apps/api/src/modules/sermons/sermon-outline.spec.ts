import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { OutlineBlock } from './ai/sermon-structurer';
import { validateSermonDocument } from './sermon-document';
import { buildOutlineDocument, outlineTitle, pastedLines, planOutline, planVerse, type VerseFound } from './sermon-outline';

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
