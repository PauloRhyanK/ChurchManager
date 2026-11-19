// Documento de exemplo e o que dele se deriva. Sem dependências além de tipos.
import type { SermonDoc } from './sermon-document';
import type { DerivedSermon } from './sermon-derive';

export const EXAMPLE_DOC: SermonDoc = {
  type: 'doc',
  content: [
    {
      type: 'verse',
      attrs: {
        id: 'v1',
        reference: 'João 8:12',
        book: 43,
        chapter: 8,
        verseStart: 12,
        verseEnd: 12,
        translation: 'BLIVRE',
        verses: [{ number: 12, text: 'Eu sou a luz do mundo; quem me segue não andará em trevas.' }],
      },
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Todo mundo já ficou sem luz em casa. A primeira coisa que a gente faz é procurar onde está a vela.' }],
    },
    { type: 'point', attrs: { id: 'pt1' }, content: [{ type: 'text', text: 'A luz chama' }] },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Antes de a gente procurar, a luz já estava acesa. Ninguém acha o caminho sozinho no escuro.' }],
    },
    {
      type: 'verse',
      attrs: {
        id: 'v2',
        reference: 'Salmos 119:105',
        book: 19,
        chapter: 119,
        verseStart: 105,
        verseEnd: 105,
        translation: 'BLIVRE',
        verses: [{ number: 105, text: 'Lâmpada para os meus pés é a tua palavra, e luz para o meu caminho.' }],
      },
    },
    {
      type: 'illustration',
      attrs: { id: 'i1' },
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'A lanterna na trilha: ela não mostra a montanha inteira, só o próximo passo.' }],
        },
      ],
    },
    {
      type: 'privateNote',
      attrs: { id: 'n1' },
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Dois minutos nessa história, não mais. Olhar para o lado esquerdo do templo.' }],
        },
      ],
    },
    { type: 'point', attrs: { id: 'pt2' }, content: [{ type: 'text', text: 'A luz mostra' }] },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Luz não serve para ser olhada, serve para a gente enxergar o resto.' }],
    },
    {
      type: 'application',
      attrs: { id: 'a1' },
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'O que você tem evitado olhar, por medo do que a luz vai mostrar?' }],
        },
      ],
    },
  ],
};

// Gerado rodando deriveSermon uma vez e conferido à mão contra as regras (ver relatório da Tarefa 3).
export const EXAMPLE_DERIVED: DerivedSermon = {
  sections: [
    { id: null, kind: 'OPENING', title: 'Abertura', number: null, seconds: 16, minutes: 1 },
    { id: 'pt1', kind: 'POINT', title: 'A luz chama', number: 1, seconds: 173, minutes: 3 },
    { id: 'pt2', kind: 'POINT', title: 'A luz mostra', number: 2, seconds: 134, minutes: 2 },
  ],
  verses: [
    { id: 'v1', reference: 'João 8:12' },
    { id: 'v2', reference: 'Salmos 119:105' },
  ],
  baseReference: 'João 8:12',
  pointCount: 2,
  verseRefs: 'joao 8:12\nsalmos 119:105',
  estimatedSeconds: 323,
};
