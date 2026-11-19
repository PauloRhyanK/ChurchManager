import { describe, expect, it } from 'vitest';
import { EXAMPLE_DOC } from '../lib/sermon-example';
import type { SermonDoc } from '../lib/document';
import { buildSermonHtml } from './sermon-print';

const base = { title: 'Luz', document: EXAMPLE_DOC, speech: '28 min de fala', includePrivate: false, credits: ['BLIVRE: Bíblia Livre'] };

describe('buildSermonHtml', () => {
  it('contém as partes do exemplo', () => {
    const html = buildSermonHtml(base);
    expect(html).toContain('<title>Luz</title>');
    expect(html).toContain('lang="pt-BR"');
    expect(html).toContain('1. A luz chama');
    expect(html).toContain('2. A luz mostra');
    expect(html).toContain('João 8:12');
    expect(html).toContain('Salmos 119:105');
    expect(html).toContain('ILUSTRAÇÃO');
    expect(html).toContain('APLICAÇÃO');
    expect(html).toContain('28 min de fala');
    expect(html).toContain('BLIVRE: Bíblia Livre');
    expect(html).toContain('Content-Security-Policy');
  });
  it('anotação privada só com includePrivate', () => {
    const note = 'Olhar para o lado esquerdo do templo';
    expect(buildSermonHtml(base)).not.toContain(note);
    expect(buildSermonHtml(base)).not.toContain('Só para mim');
    const withNote = buildSermonHtml({ ...base, includePrivate: true });
    expect(withNote).toContain(note);
    expect(withNote).toContain('Só para mim');
  });
  it('mostra números de vários versículos, listas, marcas e quebras', () => {
    const doc: SermonDoc = {
      type: 'doc',
      content: [
        {
          type: 'verse',
          attrs: { id: 'v', reference: 'R 1:1-3', book: 1, chapter: 1, verseStart: 1, verseEnd: 3, translation: null,
            verses: [{ number: 1, text: 'um' }, { number: 2, text: 'dois' }, { number: 3, text: 'três' }] },
        },
        { type: 'paragraph', content: [
          { type: 'text', text: 'negrito', marks: [{ type: 'bold' }] }, { type: 'hardBreak' },
          { type: 'text', text: 'itálico', marks: [{ type: 'italic' }] } ] },
        { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] },
        { type: 'heading', attrs: { id: 'h', level: 3 }, content: [{ type: 'text', text: 'Sub' }] },
      ],
    };
    const html = buildSermonHtml({ ...base, document: doc });
    expect(html).toContain('<sup>1</sup>');
    expect(html).toContain('<sup>3</sup>');
    expect(html).toContain('<strong>negrito</strong><br><em>itálico</em>');
    expect(html).toContain('<ol start="3">');
    expect(html).toContain('<h3>Sub</h3>');
  });
  it('escapa conteúdo hostil em toda posição', () => {
    const evil = (s: string) => `<script>${s}</script><img src=x onerror=alert(1)>`;
    const p = (t: string) => ({ type: 'paragraph' as const, content: [{ type: 'text' as const, text: t }] });
    const doc: SermonDoc = {
      type: 'doc',
      content: [
        p(evil('par')),
        { type: 'point', attrs: { id: 'p' }, content: [{ type: 'text', text: evil('pt') }] },
        { type: 'verse', attrs: { id: 'v', reference: evil('ref'), book: null, chapter: null, verseStart: null, verseEnd: null, translation: null,
          verses: [{ number: null, text: evil('vs') }] } },
        { type: 'privateNote', attrs: { id: 'n' }, content: [p(evil('nota'))] },
      ],
    };
    const html = buildSermonHtml({ title: evil('tit'), document: doc, speech: evil('sp'), includePrivate: true, credits: [evil('cr')] });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    // "onerror=" sobra como texto inerte dentro do escape; o que importa é não existir dentro de uma tag.
    expect(html).not.toMatch(/<[^>]*onerror=/i);
    expect(html).toContain('&lt;script&gt;');
  });
  it('título com script aparece escapado', () => {
    const html = buildSermonHtml({ ...base, title: '<script>alert(1)</script> & "x"' });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
    expect(html).not.toContain('<script');
  });
});
