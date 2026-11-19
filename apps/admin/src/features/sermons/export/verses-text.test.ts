import { describe, expect, it, vi } from 'vitest';
import { EXAMPLE_DOC } from '../lib/sermon-example';
import type { SermonDoc } from '../lib/document';
import { buildVersesText, downloadText, usedTranslations } from './verses-text';

describe('buildVersesText', () => {
  it('monta o texto esperado do exemplo', () => {
    const text = buildVersesText({ title: 'Luz', document: EXAMPLE_DOC, credits: ['BLIVRE: Bíblia Livre'] });
    expect(text).toBe(
      [
        'Luz',
        '',
        'João 8:12',
        'Eu sou a luz do mundo; quem me segue não andará em trevas.',
        '',
        'Salmos 119:105',
        'Lâmpada para os meus pés é a tua palavra, e luz para o meu caminho.',
        '',
        'BLIVRE: Bíblia Livre',
      ].join('\r\n'),
    );
    expect(text).not.toContain('Olhar para o lado esquerdo');
  });
  it('numera versículos de um intervalo', () => {
    const doc: SermonDoc = {
      type: 'doc',
      content: [
        {
          type: 'verse',
          attrs: {
            id: 'v', reference: 'Mateus 5:14-15', book: 40, chapter: 5, verseStart: 14, verseEnd: 15, translation: 'X',
            verses: [{ number: 14, text: 'Vós sois a luz.' }, { number: 15, text: 'Nem se acende a candeia.' }],
          },
        },
      ],
    };
    expect(buildVersesText({ title: 'T', document: doc, credits: [] })).toBe(
      ['T', '', 'Mateus 5:14-15', '14 Vós sois a luz. 15 Nem se acende a candeia.', ''].join('\r\n'),
    );
  });
  it('sem versículos', () => {
    const doc: SermonDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
    expect(buildVersesText({ title: 'T', document: doc, credits: ['c'] })).toBe(
      ['T', '', 'Nenhum versículo nesta palavra.', '', 'c'].join('\r\n'),
    );
  });
});

describe('usedTranslations', () => {
  it('lista sem repetir, na ordem', () => {
    expect(usedTranslations(EXAMPLE_DOC)).toEqual(['BLIVRE']);
  });
});

describe('downloadText', () => {
  it('baixa um Blob text/plain com BOM', async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadText('a.txt', 'olá');
    expect(click).toHaveBeenCalled();
    expect(blob!.type).toBe('text/plain;charset=utf-8');
    const read = await new Promise<ArrayBuffer>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.readAsArrayBuffer(blob!);
    }).then((buf) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(buf));
    expect(read).toBe('\uFEFFolá');
    click.mockRestore();
  });
});
