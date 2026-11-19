// "Colar texto": monta o documento do editor a partir das linhas coladas e da divisão que a IA devolveu.
// Todo texto do esboço sai das linhas coladas. Linha que a IA não cobriu vira parágrafo: nada do que foi colado se perde.
import type { OutlineBlock, OutlineKind } from './ai/sermon-structurer';
import { formatReference, parseReference, type ParsedReference } from './bible/bible-reference';
import { DOC_LIMITS, type Inline, type Inner, type SermonBlock, type SermonDoc, type VerseAttrs } from './sermon-document';

export const PASTE_LIMITS = { chars: 30_000, lines: 1_500, title: 255 } as const;

/** Linhas não vazias do texto colado, sem espaços nas pontas e com espaços repetidos reduzidos a um. */
export function pastedLines(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((l) => l.replace(/[\t ]+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

/** Uma parte já conferida: as linhas que ela cobre, na ordem do texto. */
export type PlannedPart = { kind: OutlineKind; lines: string[]; text: string; reference: string };

/**
 * Confere a divisão da IA contra as linhas: descarta parte fora do texto, invertida ou que sobrepõe a anterior,
 * e devolve as linhas não cobertas como PARAGRAPH, no lugar delas.
 */
export function planOutline(lines: string[], blocks: OutlineBlock[]): PlannedPart[] {
  const parts: PlannedPart[] = [];
  let next = 1; // primeira linha ainda não usada
  const gap = (until: number) => {
    if (until > next) parts.push({ kind: 'PARAGRAPH', lines: lines.slice(next - 1, until - 1), text: '', reference: '' });
  };
  for (const b of blocks) {
    if (b.start < next || b.end < b.start || b.end > lines.length) continue;
    gap(b.start);
    parts.push({ kind: b.kind, lines: lines.slice(b.start - 1, b.end), text: b.text.trim(), reference: b.reference.trim() });
    next = b.end + 1;
  }
  gap(lines.length + 1);
  return parts;
}

/** O versículo de uma parte VERSE: colado (o texto do pregador, sem tradução) ou a buscar na Bíblia pela referência. */
export type VersePlan =
  | { source: 'PASTED'; reference: string; ref: ParsedReference | null; text: string }
  | { source: 'LOOKUP'; reference: string; ref: ParsedReference; rest: string }
  | { source: 'NONE' };

const MIN_PASTED_VERSE = 20;
const QUOTES = /^[\s"'“”‘’«»()[\]–—-]+|[\s"'“”‘’«»()[\]–—-]+$/g;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Tira a referência de dentro do texto colado (sem diferença de acento ou maiúscula), com o que a envolve. */
function withoutReference(text: string, reference: string): string {
  if (!reference) return text;
  const at = fold(text).indexOf(fold(reference));
  // fold não muda o comprimento nos casos do português (letra + acento combinante vira só a letra)
  const cut = at < 0 || fold(text).length !== text.length ? text : text.slice(0, at) + ' ' + text.slice(at + reference.length);
  return cut.replace(/\s+/g, ' ').replace(QUOTES, '').trim();
}

export function planVerse(part: PlannedPart): VersePlan {
  const joined = part.lines.join(' ');
  const ref = parseReference(part.reference) ?? null;
  const reference = ref ? formatReference(ref) : part.reference;
  // A referência pode estar escrita de outro jeito no texto ("Jo 8.12"); tira as duas formas.
  const body = withoutReference(withoutReference(joined, part.reference), reference);
  if (body.length >= MIN_PASTED_VERSE) return { source: 'PASTED', reference: reference || body.slice(0, 40), ref, text: body };
  // O que sobrou na linha além da referência ("Jesus disse:") não se perde: vai como texto antes do versículo.
  if (ref) return { source: 'LOOKUP', reference, ref, rest: body };
  return { source: 'NONE' };
}

/** O que a Bíblia devolveu para um LOOKUP; nulo quando não achou (ou não há Bíblia importada). */
export type VerseFound = { reference: string; translation: string; verses: { number: number; text: string }[] } | null;

const textNode = (text: string): Inline[] => (text ? [{ type: 'text', text }] : []);
const paragraph = (text: string): Inner => (text ? { type: 'paragraph', content: textNode(text) } : { type: 'paragraph' });
const LIST_MARK = /^(?:[-–—•*·▪●◦]|\d{1,3}[.)]|[a-z][.)])\s+/i;
const cap = (s: string, max: number) => Array.from(s).slice(0, max).join('');

/**
 * O documento do editor. `verses[i]` é a resposta da Bíblia para a parte i quando ela é um LOOKUP.
 * `newId` gera os ids dos blocos.
 */
export function buildOutlineDocument(parts: PlannedPart[], verses: Map<number, VerseFound>, newId: () => string): SermonDoc {
  const content: SermonBlock[] = [];
  const paragraphs = (lines: string[]) => lines.forEach((l) => content.push(paragraph(l)));
  parts.forEach((part, i) => {
    switch (part.kind) {
      case 'HEADING':
      case 'POINT': {
        // A primeira linha é o título (limpo pela IA); as seguintes, se a IA as juntou, continuam como texto.
        const [first, ...rest] = part.lines;
        const title = part.text || first;
        if (part.kind === 'HEADING') content.push({ type: 'heading', attrs: { id: newId(), level: 2 }, content: textNode(title) });
        else content.push({ type: 'point', attrs: { id: newId() }, content: textNode(title) });
        paragraphs(rest);
        return;
      }
      case 'ILLUSTRATION':
      case 'APPLICATION':
        content.push({ type: part.kind === 'ILLUSTRATION' ? 'illustration' : 'application', attrs: { id: newId() }, content: part.lines.map(paragraph) });
        return;
      case 'LIST':
        content.push({
          type: 'bulletList',
          content: part.lines.map((l) => ({ type: 'listItem', content: [paragraph(l.replace(LIST_MARK, '').trim() || l)] })),
        });
        return;
      case 'VERSE': {
        const plan = planVerse(part);
        if (plan.source === 'NONE') return paragraphs(part.lines);
        if (plan.source === 'LOOKUP' && plan.rest) paragraphs([plan.rest]);
        const attrs: VerseAttrs = {
          id: newId(),
          reference: cap(plan.reference, DOC_LIMITS.reference),
          book: plan.ref?.book ?? null,
          chapter: plan.ref?.chapter ?? null,
          verseStart: plan.ref?.verseStart ?? null,
          verseEnd: plan.ref?.verseEnd ?? null,
          translation: null,
          verses: [],
        };
        if (plan.source === 'PASTED') {
          attrs.verses = [{ number: null, text: plan.text }];
        } else {
          const found = verses.get(i);
          // Sem a Bíblia (ou referência que ela não tem), o bloco fica só com a referência para o pregador completar.
          if (!found) {
            content.push({ type: 'verse', attrs });
            return;
          }
          attrs.reference = cap(found.reference, DOC_LIMITS.reference);
          attrs.translation = found.translation;
          attrs.verses = found.verses.slice(0, DOC_LIMITS.verses);
        }
        content.push({ type: 'verse', attrs });
        return;
      }
      default:
        paragraphs(part.lines);
    }
  });
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

/** Título da palavra: o da IA, senão o primeiro título ou ponto, senão "Sem título". */
export function outlineTitle(aiTitle: string, parts: PlannedPart[]): string {
  const first = parts.find((p) => p.kind === 'HEADING' || p.kind === 'POINT');
  const title = aiTitle.trim() || first?.text || first?.lines[0] || '';
  return cap(title.replace(/\s+/g, ' ').trim(), PASTE_LIMITS.title) || 'Sem título';
}
