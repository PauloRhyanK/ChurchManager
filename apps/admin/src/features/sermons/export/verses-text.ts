import type { SermonDoc, VerseAttrs } from '../lib/document';

function verseBlocks(document: SermonDoc): VerseAttrs[] {
  const out: VerseAttrs[] = [];
  for (const b of document.content) if (b.type === 'verse') out.push(b.attrs);
  return out;
}

function verseBody(verses: VerseAttrs['verses']): string {
  if (verses.length <= 1) return verses.map((v) => v.text).join('');
  return verses.map((v) => (v.number == null ? v.text : `${v.number} ${v.text}`)).join(' ');
}

export function buildVersesText(input: { title: string; document: SermonDoc; credits: string[] }): string {
  const lines: string[] = [input.title, ''];
  const verses = verseBlocks(input.document);
  if (verses.length === 0) {
    lines.push('Nenhum versículo nesta palavra.');
  } else {
    for (const v of verses) lines.push(v.reference, verseBody(v.verses), '');
    lines.pop();
  }
  lines.push('', ...input.credits);
  return lines.join('\r\n');
}

export function downloadText(fileName: string, text: string): void {
  const blob = new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function usedTranslations(document: SermonDoc): string[] {
  const seen: string[] = [];
  for (const v of verseBlocks(document)) if (v.translation && !seen.includes(v.translation)) seen.push(v.translation);
  return seen;
}
