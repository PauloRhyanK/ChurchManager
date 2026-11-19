import { formatLyrics } from './lyrics-format';
import {
  CueTarget,
  MAX_ROW_TEXT,
  MAX_ROWS,
  PartKind,
  WorshipRow,
  newRowId,
  suggestMoods,
} from './worship-document';

/**
 * Organiza a letra colada em partes, slides e instruções. POR REGRA, sem
 * modelo de linguagem: é o ponto único a trocar quando houver um.
 *
 *  - estrofe (bloco entre linhas em branco) = parte;
 *  - cabeçalho escrito pela banda ("Refrão", "[Ponte]", "Verso 2:") define o
 *    tipo e some do texto; sem cabeçalho, estrofe repetida é Refrão;
 *  - linha com `//` é instrução para a banda;
 *  - os slides saem do formatador da Ponte (`lyrics-format.ts`).
 */

const HEADER_RE =
  /^\[?\s*(refr[aã]o|coro|verso|estrofe|ponte|intro(?:du[cç][aã]o)?|pr[eé][- ]?refr[aã]o|instrumental|final)\s*\d*\s*\]?\s*:?$/i;

function headerKind(line: string): PartKind | null {
  const m = HEADER_RE.exec(line.trim());
  if (!m) return null;
  const word = plain(m[1]);
  if (word === 'refrao' || word === 'coro') return 'CHORUS';
  if (word === 'verso' || word === 'estrofe') return 'VERSE';
  if (word === 'ponte') return 'BRIDGE';
  if (word.startsWith('intro')) return 'INTRO';
  if (word.startsWith('pre')) return 'PRE_CHORUS';
  if (word === 'instrumental') return 'INSTRUMENTAL';
  return 'ENDING';
}

/** Minúsculas, sem acento nem pontuação: para comparar estrofes e nomes. */
function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const TARGET_RE = /^(todos|solo|voz(?:es)?|vocal|teclado|viol[aã]o|guitarra|baixo|bateria)(?![\p{L}])\s*(:)?\s*(.*)$/iu;

/** `//Solo: voz masculina` → Vocal; sem nome reconhecido, vai para Todos. */
export function parseCue(raw: string): { target: CueTarget; text: string } {
  const text = raw.replace(/\s+/g, ' ').trim().replace(/\.+$/, '').trim();
  const m = TARGET_RE.exec(text);
  if (!m) return { target: 'ALL', text };
  const name = plain(m[1]);
  const target: CueTarget =
    name === 'todos' ? 'ALL'
    : name === 'teclado' ? 'KEYS'
    : name === 'violao' ? 'ACOUSTIC_GUITAR'
    : name === 'guitarra' ? 'ELECTRIC_GUITAR'
    : name === 'baixo' ? 'BASS'
    : name === 'bateria' ? 'DRUMS'
    : 'VOCAL';
  const rest = m[3].trim();
  // Só o "Nome:" com dois-pontos é endereçamento; "Solo feminino…" é o recado inteiro.
  if (!m[2] || !rest) return { target, text };
  return { target, text: name === 'solo' ? `solo, ${rest}` : rest };
}

type Item = { t: 'lyric'; text: string } | { t: 'cue'; text: string };
interface Stanza {
  explicit: PartKind | null;
  items: Item[];
}

function readStanzas(raw: string): Stanza[] {
  const stanzas: Stanza[] = [];
  let current: Stanza | null = null;
  let headerForNext: PartKind | null = null;
  const close = () => {
    if (!current) return;
    if (current.items.length) stanzas.push(current);
    else if (current.explicit) headerForNext = current.explicit;
    current = null;
  };
  for (const line of raw.replace(/\r/g, '').replace(/\t/g, ' ').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      close();
      continue;
    }
    if (!current) {
      current = { explicit: headerForNext, items: [] };
      headerForNext = null;
    }
    const stanza: Stanza = current;
    const idx = trimmed.indexOf('//');
    const lyric = idx >= 0 ? trimmed.slice(0, idx).trim() : trimmed;
    if (lyric) {
      const kind = stanza.items.length === 0 ? headerKind(lyric) : null;
      if (kind) stanza.explicit = kind;
      else stanza.items.push({ t: 'lyric', text: lyric });
    }
    if (idx >= 0 && trimmed.slice(idx + 2).trim()) stanza.items.push({ t: 'cue', text: trimmed.slice(idx + 2) });
  }
  close();
  return stanzas;
}

const stanzaKey = (s: Stanza) =>
  plain(
    s.items
      .filter((i) => i.t === 'lyric')
      .map((i) => i.text.replace(/\s*\(?\s*\d+\s*[xX]\s*\)?\s*$/, ''))
      .join(' '),
  );

export function organizeLyrics(raw: string): WorshipRow[] {
  const stanzas = readStanzas(raw);

  // Estrofe só de recados não é parte: os recados passam para a estrofe seguinte.
  const merged: Stanza[] = [];
  let leading: Item[] = [];
  for (const s of stanzas) {
    const hasLyric = s.items.some((i) => i.t === 'lyric');
    if (!hasLyric && !s.explicit) {
      leading.push(...s.items);
      continue;
    }
    merged.push({ explicit: s.explicit, items: [...leading, ...s.items] });
    leading = [];
  }
  if (leading.length) merged.push({ explicit: 'ENDING', items: leading });

  const counts = new Map<string, number>();
  for (const s of merged) {
    const key = stanzaKey(s);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const kinds: PartKind[] = merged.map((s) => {
    if (s.explicit) return s.explicit;
    const key = stanzaKey(s);
    if (!key) return 'INSTRUMENTAL';
    return (counts.get(key) ?? 0) > 1 ? 'CHORUS' : 'VERSE';
  });
  const moods = suggestMoods(kinds);

  const rows: WorshipRow[] = [];
  merged.forEach((stanza, index) => {
    const start = rows.length;
    let run: string[] = [];
    let cues: Item[] = [];
    let slidesInPart = 0;
    const pushSlide = (lines: string[]) => {
      if (slidesInPart > 0) rows.push({ id: newRowId(), type: 'break' });
      for (const c of cues) {
        const cue = parseCue(c.text);
        rows.push({ id: newRowId(), type: 'cue', target: cue.target, text: cue.text.slice(0, MAX_ROW_TEXT) });
      }
      cues = [];
      for (const text of lines) rows.push({ id: newRowId(), type: 'lyric', text: text.slice(0, MAX_ROW_TEXT) });
      slidesInPart += 1;
    };
    const flushRun = () => {
      if (!run.length) return;
      for (const slide of formatLyrics(run.join('\n'), { upper: false }).slides) {
        if (slide.lines.length) pushSlide(slide.lines);
      }
      run = [];
    };
    for (const item of stanza.items) {
      if (item.t === 'lyric') run.push(item.text);
      else {
        flushRun();
        cues.push(item);
      }
    }
    flushRun();
    if (cues.length) pushSlide([]); // recado sem letra depois: slide só de instrução
    if (rows[start]) rows[start].part = { kind: kinds[index], mood: moods[index] };
  });

  return rows.slice(0, MAX_ROWS);
}
