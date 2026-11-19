/**
 * Quebra de letra em slides. PORTE FIEL do formatador da Ponte do Culto
 * (`apps/ponte/pc/letras.html`, função `formatLyrics`): mesmas listas de
 * palavras, mesmo custo, mesma ordem de decisões. Lá ele roda no navegador do
 * PC da igreja; aqui, no servidor. Se a regra mudar num, mude no outro.
 */

const FUNC = new Set(['e','o','a','os','as','de','do','da','dos','das','em','no','na','nos','nas','que','para','pra','com','por','pelo','pela','um','uma','me','te','se','ao','meu','minha','teu','tua','seu','sua','nosso','nossa','sobre','porque','pois','mas','nesse','neste','nessa','nesta','quando','onde','como']);
const WEAK_END = new Set(['o','a','os','as','de','do','da','dos','das','em','no','na','nos','nas','um','uma','ao','e','que','para','pra','com','por','pelo','pela','meu','minha','teu','tua','seu','sua','nosso','nossa','me','te','se']);
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}]/gu, '');

/**
 * Programação dinâmica sobre as palavras: escolhe as quebras de menor custo.
 * Prefere menos linhas, linhas parelhas, quebra depois de pontuação e nunca
 * terminar em palavrinha solta. Linha acima do limite só quando é uma palavra
 * sozinha maior que o limite.
 */
export function splitPhrase(words: string[], maxC: number): string[][] {
  const n = words.length;
  const comp = (i: number, j: number) => {
    let t = j - i - 1;
    for (let k = i; k < j; k++) t += words[k].length;
    return t;
  };
  if (comp(0, n) <= maxC) return [words];
  const best = new Array<number>(n + 1).fill(Infinity);
  const prev = new Array<number>(n + 1).fill(-1);
  best[0] = 0;
  for (let j = 1; j <= n; j++) {
    for (let i = j - 1; i >= 0; i--) {
      const L = comp(i, j);
      if (L > maxC && j - i > 1) break;
      if (best[i] === Infinity) continue;
      let c = 1;
      if (L > maxC) c += 40;
      else {
        const folga = (maxC - L) / maxC;
        c += folga * folga * 3;
      }
      if (j < n) {
        const last = words[j - 1];
        if (/[,;:.!?]$/.test(last)) c -= 1.5;
        else {
          if (WEAK_END.has(norm(last))) c += 2.5;
          if (FUNC.has(norm(words[j]))) c -= 0.5;
        }
      }
      if (best[i] + c < best[j]) {
        best[j] = best[i] + c;
        prev[j] = i;
      }
    }
  }
  const out: string[][] = [];
  for (let j = n; j > 0; j = prev[j]) out.unshift(words.slice(prev[j], j));
  return out;
}

export interface FormatOptions {
  maxC: number;
  maxLines: number;
  upper: boolean;
  expand: boolean;
  maxCom: number;
}

export interface FormattedSlide {
  pre: string[];
  lines: string[];
  post: string[];
}

function wrapComment(text: string, maxC: number): string[] {
  text = text.trim();
  if (text.length <= maxC) return ['//' + text];
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > maxC) {
      out.push('//' + cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push('//' + cur);
  return out;
}

type Item =
  | { t: 'break' }
  | { t: 'comment'; text: string }
  | { t: 'lyric'; text: string; repFirst: boolean; repLast: boolean };

export function formatLyrics(input: string, opt: Partial<FormatOptions> = {}): { slides: FormattedSlide[]; text: string } {
  const o: FormatOptions = { maxC: 28, maxLines: 3, upper: true, expand: true, maxCom: 36, ...opt };
  // 1) itens: comentário, letra ou quebra
  const items: Item[] = [];
  for (let raw of input.replace(/\r/g, '').split('\n')) {
    raw = raw.trim();
    if (!raw) {
      items.push({ t: 'break' });
      continue;
    }
    let lyric = raw;
    let comments: string[] = [];
    const idx = raw.indexOf('//');
    if (idx >= 0) {
      lyric = raw.slice(0, idx).trim();
      comments = [raw.slice(idx + 2)];
    }
    if (lyric) {
      let times = 1;
      const m = lyric.match(/\s*\(?\s*(\d+)\s*[xX]\s*\)?\s*$/);
      if (o.expand && m && m.index !== undefined && m.index > 0) {
        times = Math.min(+m[1], 12);
        lyric = lyric.slice(0, m.index).trim();
      }
      for (let k = 0; k < times; k++) {
        items.push({ t: 'lyric', text: lyric, repFirst: times > 1 && k === 0, repLast: times > 1 && k === times - 1 });
      }
    }
    for (const c of comments) items.push({ t: 'comment', text: c });
  }

  // 2) agrupamento em slides
  const slides: FormattedSlide[] = [];
  let pre: string[] = [];
  let pending: string[] = [];
  let sectionStart = 0;
  let carry: string | null = null;
  const up = (s: string) => (o.upper ? s.toLocaleUpperCase('pt-BR') : s);
  const emit = (lines: string[]) => {
    if (carry !== null) {
      if (lines.length < o.maxLines) lines = [carry, ...lines];
      else slides.push({ pre: pre.splice(0), lines: [carry], post: [] });
      carry = null;
    }
    slides.push({ pre, lines, post: [] });
    pre = [];
  };
  const last = () => slides[slides.length - 1];
  const canAppend = () => slides.length > sectionStart && last().lines.length < o.maxLines && !last().post.length;
  const flush = () => {
    if (pending.length === 1 && canAppend()) last().lines.push(pending[0]);
    else if (pending.length) emit(pending);
    else if (carry !== null) emit([]);
    pending = [];
  };

  for (const it of items) {
    if (it.t === 'break') {
      flush();
      sectionStart = slides.length;
      continue;
    }
    if (it.t === 'comment') {
      flush();
      const lines = wrapComment(it.text, o.maxCom);
      if (slides.length) last().post.push(...lines);
      else pre.push(...lines);
      sectionStart = slides.length;
      continue;
    }
    if (it.repFirst) {
      if (pending.length === 1 && !canAppend()) carry = pending.pop() ?? null;
      else flush();
    }
    const chunks = splitPhrase(it.text.split(/\s+/), o.maxC).map((w) => up(w.join(' ')));
    const k = chunks.length;
    if (k === 1) {
      pending.push(chunks[0]);
      if (pending.length === 2) {
        emit(pending);
        pending = [];
      }
      if (it.repLast) flush();
      continue;
    }
    if (pending.length === 1 && k + 1 <= o.maxLines) {
      emit([pending[0], ...chunks]);
      pending = [];
      continue;
    }
    flush();
    if (k <= o.maxLines) {
      emit(chunks);
      if (it.repLast) flush();
      continue;
    }
    const m = Math.ceil(k / o.maxLines);
    let start = 0;
    for (let s = 0; s < m; s++) {
      const size = Math.floor(k / m) + (s < k % m ? 1 : 0);
      emit(chunks.slice(start, start + size));
      start += size;
    }
    if (it.repLast) flush();
  }
  flush();
  if (pre.length) {
    if (slides.length) last().post.push(...pre);
    else slides.push({ pre, lines: [], post: [] });
  }

  const text = slides.map((s) => [...s.pre, ...s.lines, ...s.post].join('\n')).join('\n\n');
  return { slides, text };
}
