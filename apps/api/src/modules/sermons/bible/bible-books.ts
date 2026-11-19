export type BibleBook = { number: number; name: string; vpl: string; chapters: number; aliases: string[] };

function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s.]+/g, '');
}

// [nome, código VPL, capítulos, abreviações extras]. O nome inteiro (sem acento e sem espaço) entra sozinho.
const RAW: Array<[string, string, number, string[]]> = [
  ['Gênesis', 'GEN', 50, ['gn', 'gen']],
  ['Êxodo', 'EXO', 40, ['ex', 'exo']],
  ['Levítico', 'LEV', 27, ['lv', 'lev']],
  ['Números', 'NUM', 36, ['nm', 'num']],
  ['Deuteronômio', 'DEU', 34, ['dt', 'deut']],
  ['Josué', 'JOS', 24, ['js', 'jos']],
  ['Juízes', 'JDG', 21, ['jz', 'juiz']],
  ['Rute', 'RUT', 4, ['rt', 'rut']],
  ['1 Samuel', '1SA', 31, ['1sm', '1sam']],
  ['2 Samuel', '2SA', 24, ['2sm', '2sam']],
  ['1 Reis', '1KI', 22, ['1rs', '1rei']],
  ['2 Reis', '2KI', 25, ['2rs', '2rei']],
  ['1 Crônicas', '1CH', 29, ['1cr', '1cron']],
  ['2 Crônicas', '2CH', 36, ['2cr', '2cron']],
  ['Esdras', 'EZR', 10, ['ed', 'esd']],
  ['Neemias', 'NEH', 13, ['ne', 'nee']],
  ['Ester', 'EST', 10, ['et', 'est']],
  ['Jó', 'JOB', 42, ['job']],
  ['Salmos', 'PSA', 150, ['sl', 'sal', 'salmo']],
  ['Provérbios', 'PRO', 31, ['pv', 'prov', 'proverbio']],
  ['Eclesiastes', 'ECC', 12, ['ec', 'ecl']],
  ['Cantares', 'SOL', 8, ['ct', 'cant', 'canticos', 'cantaresdesalomao']],
  ['Isaías', 'ISA', 66, ['is', 'isa']],
  ['Jeremias', 'JER', 52, ['jr', 'jer']],
  ['Lamentações', 'LAM', 5, ['lm', 'lam']],
  ['Ezequiel', 'EZE', 48, ['ez', 'eze']],
  ['Daniel', 'DAN', 12, ['dn', 'dan']],
  ['Oseias', 'HOS', 14, ['os', 'ose']],
  ['Joel', 'JOE', 3, ['jl']],
  ['Amós', 'AMO', 9, ['am', 'amo']],
  ['Obadias', 'OBA', 1, ['ob', 'oba']],
  ['Jonas', 'JON', 4, ['jn', 'jon']],
  ['Miqueias', 'MIC', 7, ['mq', 'miq']],
  ['Naum', 'NAH', 3, ['na', 'nau']],
  ['Habacuque', 'HAB', 3, ['hc', 'hab']],
  ['Sofonias', 'ZEP', 3, ['sf', 'sof']],
  ['Ageu', 'HAG', 2, ['ag', 'age']],
  ['Zacarias', 'ZEC', 14, ['zc', 'zac']],
  ['Malaquias', 'MAL', 4, ['ml', 'mal']],
  ['Mateus', 'MAT', 28, ['mt', 'mat']],
  ['Marcos', 'MAR', 16, ['mc', 'mar']],
  ['Lucas', 'LUK', 24, ['lc', 'luc']],
  ['João', 'JOH', 21, ['jo', 'joa']],
  ['Atos', 'ACT', 28, ['at', 'atosdosapostolos']],
  ['Romanos', 'ROM', 16, ['rm', 'rom']],
  ['1 Coríntios', '1CO', 16, ['1co', '1cor']],
  ['2 Coríntios', '2CO', 13, ['2co', '2cor']],
  ['Gálatas', 'GAL', 6, ['gl', 'gal']],
  ['Efésios', 'EPH', 6, ['ef', 'efe']],
  ['Filipenses', 'PHI', 4, ['fp', 'fil']],
  ['Colossenses', 'COL', 4, ['cl', 'col']],
  ['1 Tessalonicenses', '1TH', 5, ['1ts', '1tes']],
  ['2 Tessalonicenses', '2TH', 3, ['2ts', '2tes']],
  ['1 Timóteo', '1TI', 6, ['1tm', '1tim']],
  ['2 Timóteo', '2TI', 4, ['2tm', '2tim']],
  ['Tito', 'TIT', 3, ['tt', 'tit']],
  ['Filemom', 'PHM', 1, ['fm', 'flm', 'filemon']],
  ['Hebreus', 'HEB', 13, ['hb', 'heb']],
  ['Tiago', 'JAM', 5, ['tg', 'tia']],
  ['1 Pedro', '1PE', 5, ['1pe', '1ped']],
  ['2 Pedro', '2PE', 3, ['2pe', '2ped']],
  ['1 João', '1JO', 5, ['1jo', '1joa']],
  ['2 João', '2JO', 1, ['2jo', '2joa']],
  ['3 João', '3JO', 1, ['3jo', '3joa']],
  ['Judas', 'JUD', 1, ['jd', 'jud']],
  ['Apocalipse', 'REV', 22, ['ap', 'apoc']],
];

export const BIBLE_BOOKS: BibleBook[] = RAW.map(([name, vpl, chapters, extra], i) => {
  // "Jó" sem acento colide com "Jo" (João): o nome inteiro de Jó fica de fora; ele entra por "job" e pelo acento.
  const own = name === 'Jó' ? [] : [plain(name)];
  return { number: i + 1, name, vpl, chapters, aliases: Array.from(new Set([...own, ...extra])) };
});

export function bookByNumber(n: number): BibleBook | undefined {
  return BIBLE_BOOKS[n - 1];
}

export function bookByVplCode(code: string): BibleBook | undefined {
  const c = code.trim().toUpperCase();
  return BIBLE_BOOKS.find((b) => b.vpl === c);
}
