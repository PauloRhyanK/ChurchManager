import { escapeHtml } from '@/lib/print';
import type { Inline, Inner, SermonDoc, SermonBlock } from '../lib/document';

const CSS = `
@page { size: A4; margin: 20mm; }
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #111; margin: 0; }
header { border-bottom: 1px solid #999; margin-bottom: 14pt; padding-bottom: 8pt; }
header h1 { font-size: 20pt; margin: 0 0 4pt; }
.speech { color: #555; font-size: 10pt; margin: 0; }
h2 { font-size: 15pt; margin: 18pt 0 6pt; break-after: avoid; }
h3 { font-size: 13pt; margin: 14pt 0 4pt; break-after: avoid; }
p { margin: 0 0 8pt; }
ul, ol { margin: 0 0 8pt; padding-left: 22pt; }
.box { page-break-inside: avoid; break-inside: avoid; margin: 10pt 0; padding: 8pt 12pt; }
.verse { border-left: 3pt solid #555; background: #f6f6f6; }
.verse .ref { font-weight: bold; margin: 4pt 0 0; }
.verse sup { font-size: 8pt; margin-right: 2pt; }
.note { border: 1px solid #bbb; background: #f3f3f3; }
.illustration, .application { border: 1px solid #ccc; }
.label { font-family: Arial, sans-serif; font-size: 8pt; font-weight: bold; letter-spacing: 0.08em; color: #555; margin: 0 0 4pt; }
.note { border-style: dashed; }
footer { margin-top: 24pt; border-top: 1px solid #ccc; padding-top: 6pt; font-size: 8pt; color: #555; }
footer p { margin: 0; }
`;

function inline(content: Inline[] | undefined): string {
  return (content ?? [])
    .map((c) => {
      if (c.type === 'hardBreak') return '<br>';
      let html = escapeHtml(c.text);
      const marks = c.marks ?? [];
      if (marks.some((m) => m.type === 'italic')) html = `<em>${html}</em>`;
      if (marks.some((m) => m.type === 'bold')) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

function inner(blocks: Inner[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'paragraph') return `<p>${inline(b.content)}</p>`;
      const items = b.content.map((item) => `<li>${inner(item.content)}</li>`).join('');
      if (b.type === 'bulletList') return `<ul>${items}</ul>`;
      const start = b.attrs?.start;
      const attr = typeof start === 'number' && Number.isFinite(start) ? ` start="${Math.trunc(start)}"` : '';
      return `<ol${attr}>${items}</ol>`;
    })
    .join('');
}

function box(cls: string, label: string, body: string): string {
  return `<section class="box ${cls}"><p class="label">${escapeHtml(label)}</p>${body}</section>`;
}

export function buildSermonHtml(input: {
  title: string;
  document: SermonDoc;
  speech: string;
  includePrivate: boolean;
  credits: string[];
}): string {
  let pointNumber = 0;
  const render = (b: SermonBlock): string => {
    switch (b.type) {
      case 'paragraph':
      case 'bulletList':
      case 'orderedList':
        return inner([b]);
      case 'heading':
        return `<h${b.attrs.level}>${inline(b.content)}</h${b.attrs.level}>`;
      case 'point':
        pointNumber += 1;
        return `<h2>${pointNumber}. ${inline(b.content)}</h2>`;
      case 'verse': {
        const many = b.attrs.verses.length > 1;
        const text = b.attrs.verses
          .map((v) => (many && v.number != null ? `<sup>${escapeHtml(v.number)}</sup>${escapeHtml(v.text)}` : escapeHtml(v.text)))
          .join(' ');
        return `<section class="box verse"><p>${text}</p><p class="ref">${escapeHtml(b.attrs.reference)}</p></section>`;
      }
      case 'illustration':
        return box('illustration', 'ILUSTRAÇÃO', inner(b.content));
      case 'application':
        return box('application', 'APLICAÇÃO', inner(b.content));
      case 'privateNote':
        return input.includePrivate ? box('note', 'Só para mim', inner(b.content)) : '';
    }
  };
  const body = input.document.content.map(render).join('\n');
  const credits = input.credits.map((c) => `<p>${escapeHtml(c)}</p>`).join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(input.title)}</title>
<style>${CSS}</style>
</head>
<body>
<header><h1>${escapeHtml(input.title)}</h1><p class="speech">${escapeHtml(input.speech)}</p></header>
<main>
${body}
</main>
${credits ? `<footer>${credits}</footer>` : ''}
</body>
</html>`;
}
