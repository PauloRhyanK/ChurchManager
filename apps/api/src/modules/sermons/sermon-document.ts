import { BadRequestException } from '@nestjs/common';

export type Inline = { type: 'text'; text: string; marks?: { type: 'bold' | 'italic' }[] } | { type: 'hardBreak' };

export type VerseAttrs = {
  id: string;
  reference: string; // "João 8:12" ou "Mateus 5:14-16", como aparece na tela
  book: number | null; // 1–66; nulo quando digitado à mão sem referência reconhecida
  chapter: number | null;
  verseStart: number | null;
  verseEnd: number | null;
  translation: string | null; // código da tradução ("BLIVRE"); nulo quando digitado à mão
  verses: { number: number | null; text: string }[]; // o texto, copiado para dentro do documento
};

export type SermonBlock =
  | { type: 'paragraph'; content?: Inline[] }
  | { type: 'heading'; attrs: { id: string; level: 2 | 3 }; content?: Inline[] }
  | { type: 'bulletList'; content: ListItem[] }
  | { type: 'orderedList'; attrs?: { start?: number; type?: string | null }; content: ListItem[] }
  | { type: 'point'; attrs: { id: string }; content?: Inline[] }
  | { type: 'verse'; attrs: VerseAttrs }
  | { type: 'illustration' | 'application' | 'privateNote'; attrs: { id: string }; content: Inner[] };

export type Inner = Extract<SermonBlock, { type: 'paragraph' | 'bulletList' | 'orderedList' }>;
export type ListItem = { type: 'listItem'; content: Inner[] };
export type SermonDoc = { type: 'doc'; content: SermonBlock[] };

export const DOC_LIMITS = { nodes: 3000, chars: 300_000, depth: 8, id: 36, reference: 120, verses: 200 } as const;

export const EMPTY_DOC: SermonDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

const INLINE_TYPES = ['text', 'hardBreak'];
const INNER_TYPES = ['paragraph', 'bulletList', 'orderedList'];
const ID_ATTRS = ['id'];

function fail(path: string, message: string): never {
  throw new BadRequestException(`Documento inválido em ${path}: ${message}.`);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Aceita o documento (JSON do ProseMirror restrito ao esquema) ou lança 400 em pt-BR. Não corrige nada. */
export function validateSermonDocument(input: unknown): SermonDoc {
  let nodes = 0;
  let chars = 0;

  function keys(o: Obj, allowed: string[], path: string) {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(path, `campo "${k}" não é permitido`);
  }

  function enter(depth: number, path: string) {
    if (depth > DOC_LIMITS.depth) fail(path, `mais de ${DOC_LIMITS.depth} níveis de profundidade`);
    if (++nodes > DOC_LIMITS.nodes) fail(path, `mais de ${DOC_LIMITS.nodes} nós`);
  }

  function addChars(n: number, path: string) {
    chars += n;
    if (chars > DOC_LIMITS.chars) fail(path, `mais de ${DOC_LIMITS.chars} caracteres de texto`);
  }

  function str(v: unknown, max: number, path: string, label: string): string {
    if (typeof v !== 'string' || v.length === 0) fail(path, `${label} deve ser um texto não vazio`);
    if (v.length > max) fail(path, `${label} passa de ${max} caracteres`);
    return v;
  }

  function intOrNull(v: unknown, min: number, max: number, path: string, label: string) {
    if (v === null) return;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      fail(path, `${label} deve ser nulo ou um inteiro entre ${min} e ${max}`);
    }
  }

  function attrs(n: Obj, allowed: string[], path: string): Obj {
    if (!isObj(n.attrs)) fail(path, 'faltam os atributos');
    keys(n.attrs, allowed, `${path}.attrs`);
    return n.attrs;
  }

  function list(v: unknown, path: string): unknown[] {
    if (!Array.isArray(v)) fail(path, 'o conteúdo deve ser uma lista');
    return v;
  }

  function inline(v: unknown, depth: number, path: string): void {
    if (!isObj(v) || typeof v.type !== 'string' || !INLINE_TYPES.includes(v.type)) fail(path, 'tipo de nó inline não permitido');
    enter(depth, path);
    if (v.type === 'hardBreak') {
      keys(v, ['type'], path);
      return;
    }
    keys(v, ['type', 'text', 'marks'], path);
    if (typeof v.text !== 'string' || v.text.length === 0) fail(path, 'o texto deve ser não vazio');
    addChars(v.text.length, path);
    if (v.marks !== undefined) {
      list(v.marks, `${path}.marks`).forEach((m, i) => {
        const mp = `${path}.marks[${i}]`;
        if (!isObj(m) || (m.type !== 'bold' && m.type !== 'italic')) fail(mp, 'só negrito e itálico são permitidos');
        keys(m, ['type'], mp);
      });
    }
  }

  function inlineContent(n: Obj, depth: number, path: string) {
    if (n.content === undefined) return;
    list(n.content, `${path}.content`).forEach((c, i) => inline(c, depth + 1, `${path}.content[${i}]`));
  }

  function inner(v: unknown, depth: number, path: string): void {
    if (!isObj(v) || typeof v.type !== 'string' || !INNER_TYPES.includes(v.type)) {
      fail(path, 'aqui só cabem parágrafo e listas');
    }
    block(v, depth, path);
  }

  function listItem(v: unknown, depth: number, path: string): void {
    if (!isObj(v) || v.type !== 'listItem') fail(path, 'a lista só aceita itens de lista');
    enter(depth, path);
    keys(v, ['type', 'content'], path);
    list(v.content, `${path}.content`).forEach((c, i) => inner(c, depth + 1, `${path}.content[${i}]`));
  }

  function verseNode(n: Obj, path: string) {
    const a = attrs(n, ['id', 'reference', 'book', 'chapter', 'verseStart', 'verseEnd', 'translation', 'verses'], path);
    str(a.id, DOC_LIMITS.id, `${path}.attrs.id`, 'id');
    str(a.reference, DOC_LIMITS.reference, `${path}.attrs.reference`, 'referência');
    addChars((a.reference as string).length, path);
    intOrNull(a.book, 1, 66, path, 'livro');
    intOrNull(a.chapter, 1, Number.MAX_SAFE_INTEGER, path, 'capítulo');
    intOrNull(a.verseStart, 1, Number.MAX_SAFE_INTEGER, path, 'versículo inicial');
    intOrNull(a.verseEnd, 1, Number.MAX_SAFE_INTEGER, path, 'versículo final');
    if (a.translation !== null) str(a.translation, DOC_LIMITS.id, `${path}.attrs.translation`, 'tradução');
    const verses = list(a.verses, `${path}.attrs.verses`);
    if (verses.length > DOC_LIMITS.verses) fail(path, `mais de ${DOC_LIMITS.verses} versículos no bloco`);
    verses.forEach((x, i) => {
      const vp = `${path}.attrs.verses[${i}]`;
      if (!isObj(x)) fail(vp, 'versículo inválido');
      keys(x, ['number', 'text'], vp);
      intOrNull(x.number, 1, Number.MAX_SAFE_INTEGER, vp, 'número do versículo');
      if (typeof x.text !== 'string') fail(vp, 'o texto do versículo deve ser um texto');
      addChars(x.text.length, vp);
    });
  }

  function block(n: Obj, depth: number, path: string): void {
    enter(depth, path);
    switch (n.type) {
      case 'paragraph':
        keys(n, ['type', 'content'], path);
        inlineContent(n, depth, path);
        return;
      case 'heading': {
        keys(n, ['type', 'attrs', 'content'], path);
        const a = attrs(n, ['id', 'level'], path);
        str(a.id, DOC_LIMITS.id, `${path}.attrs.id`, 'id');
        if (a.level !== 2 && a.level !== 3) fail(path, 'o título deve ser de nível 2 ou 3');
        inlineContent(n, depth, path);
        return;
      }
      case 'point': {
        keys(n, ['type', 'attrs', 'content'], path);
        str(attrs(n, ID_ATTRS, path).id, DOC_LIMITS.id, `${path}.attrs.id`, 'id');
        inlineContent(n, depth, path);
        return;
      }
      case 'orderedList':
        keys(n, ['type', 'attrs', 'content'], path);
        if (n.attrs !== undefined) {
          const a = attrs(n, ['start', 'type'], path);
          const ap = `${path}.attrs`;
          if (a.start !== undefined && (typeof a.start !== 'number' || !Number.isInteger(a.start) || a.start < 1)) {
            fail(ap, 'o início da lista deve ser um inteiro a partir de 1');
          }
          if (a.type !== undefined && a.type !== null && (typeof a.type !== 'string' || a.type.length > 8)) {
            fail(ap, 'o tipo da lista deve ser nulo ou um texto de até 8 caracteres');
          }
        }
        list(n.content, `${path}.content`).forEach((c, i) => listItem(c, depth + 1, `${path}.content[${i}]`));
        return;
      case 'bulletList':
        keys(n, ['type', 'content'], path);
        list(n.content, `${path}.content`).forEach((c, i) => listItem(c, depth + 1, `${path}.content[${i}]`));
        return;
      case 'verse':
        keys(n, ['type', 'attrs'], path);
        verseNode(n, path);
        return;
      case 'illustration':
      case 'application':
      case 'privateNote':
        keys(n, ['type', 'attrs', 'content'], path);
        str(attrs(n, ID_ATTRS, path).id, DOC_LIMITS.id, `${path}.attrs.id`, 'id');
        list(n.content, `${path}.content`).forEach((c, i) => inner(c, depth + 1, `${path}.content[${i}]`));
        return;
      default:
        fail(path, `tipo de nó "${String(n.type)}" não permitido`);
    }
  }

  if (!isObj(input) || input.type !== 'doc') fail('documento', 'deve ser um objeto do tipo "doc"');
  keys(input, ['type', 'content'], 'documento');
  const content = list(input.content, 'documento.content');
  // A raiz ocupa o nível 1 e não entra na contagem de nós.
  content.forEach((c, i) => {
    const path = `documento.content[${i}]`;
    if (!isObj(c)) fail(path, 'bloco inválido');
    block(c, 2, path);
  });
  return input as SermonDoc;
}
