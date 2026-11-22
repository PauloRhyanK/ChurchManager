import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLyrics } from './lyrics-format';
import { organizeLyrics, parseCue } from './lyrics-organizer';
import { deriveSong, MAX_ROW_TEXT } from './worship-document';

// Entrada e saída copiadas de `apps/ponte/pc/letras.html` (o EXEMPLO da tela e
// o que o script original devolve para ele): o porte tem de dar o mesmo texto.
const EXEMPLO = `//Exemplo — apague e cole sua música
//Solo feminino - entrada suave, só teclado
O Senhor é o meu pastor e nada me faltará
Em verdes pastos me faz repousar
Junto às águas tranquilas me conduz
//Todos: uníssono
Ainda que eu ande pelo vale escuro
Não temerei, pois tu estás comigo
//Todos: div. de vozes
Santo, santo
Santo és, Senhor (2x)
Bondade e misericórdia me seguirão
Habitarei na tua casa pra sempre`;
const SAIDA_DA_PONTE =
  '//Exemplo — apague e cole sua música\n//Solo feminino - entrada suave, só\n//teclado\nO SENHOR É O MEU PASTOR\nE NADA ME FALTARÁ\n\nEM VERDES PASTOS\nME FAZ REPOUSAR\n\nJUNTO ÀS ÁGUAS TRANQUILAS\nME CONDUZ\n//Todos: uníssono\n\nAINDA QUE EU ANDE\nPELO VALE ESCURO\n\nNÃO TEMEREI,\nPOIS TU ESTÁS COMIGO\n//Todos: div. de vozes\n\nSANTO, SANTO\nSANTO ÉS, SENHOR\nSANTO ÉS, SENHOR\n\nBONDADE E MISERICÓRDIA\nME SEGUIRÃO\n\nHABITAREI NA TUA CASA\nPRA SEMPRE';

test('formatLyrics: o porte devolve o mesmo texto do formatador da Ponte', () => {
  assert.equal(formatLyrics(EXEMPLO).text, SAIDA_DA_PONTE);
});

test('organizeLyrics respeita limites configurados e mantém os padrões antigos por omissão', () => {
  const lyrics = 'Linha um\nLinha dois\nLinha três';
  assert.equal(deriveSong(organizeLyrics(lyrics)).slides.length, 1);
  assert.equal(deriveSong(organizeLyrics(lyrics, { maxC: 60, maxLines: 2 })).slides.length, 2);
  const long = 'Palavra comprida atravessa limite configurado';
  assert.ok(deriveSong(organizeLyrics(long, { maxC: 16, maxLines: 3 })).slides.every((slide) => slide.lines.every((line) => line.length <= 16)));
});

test('organizeLyrics: os slides do exemplo têm as mesmas linhas de letra da Ponte', () => {
  const esperado = SAIDA_DA_PONTE.split('\n\n').map((b) => b.split('\n').filter((l) => !l.startsWith('//')));
  const { slides } = deriveSong(organizeLyrics(EXEMPLO));
  assert.deepEqual(slides.map((s) => s.lines), esperado);
  // O recado vale para o slide que vem DEPOIS dele.
  assert.deepEqual(slides[3].cues, [{ target: 'ALL', text: 'uníssono' }]);
  assert.equal(slides[0].cues.length, 2);
});

const MUSICA = `Antes do sol nascer
Tua voz me chamou

És a luz da manhã
Que não vai se apagar

Quando a noite pesar
Eu me lembro de Ti

És a luz da manhã
Que não vai se apagar`;

test('estrofe repetida vira Refrão; as outras, Verso numerado', () => {
  const { parts } = deriveSong(organizeLyrics(MUSICA));
  assert.deepEqual(parts.map((p) => p.name), ['Verso 1', 'Refrão', 'Verso 2', 'Refrão']);
});

test('clima sugerido: verso Adoração, refrão Celebração, último refrão Explosão', () => {
  const { parts } = deriveSong(organizeLyrics(MUSICA));
  assert.deepEqual(parts.map((p) => p.mood), ['WORSHIP', 'CELEBRATION', 'WORSHIP', 'EXPLOSION']);
});

test('cabeçalho da banda define o tipo e some do texto', () => {
  const rows = organizeLyrics('Intro\n//Teclado: pad\n\n[Ponte]\nMesmo sem ver\n\nRefrão:\n\nEu vou confiar\n\nPré-refrão\nSobe a voz');
  const { parts, slides } = deriveSong(rows);
  assert.deepEqual(parts.map((p) => p.kind), ['INTRO', 'BRIDGE', 'CHORUS', 'PRE_CHORUS']);
  assert.deepEqual(slides.map((s) => s.lines), [[], ['MESMO SEM VER'], ['EU VOU CONFIAR'], ['SOBE A VOZ']]);
  assert.deepEqual(slides[0].cues, [{ target: 'KEYS', text: 'pad' }]);
});

test('parseCue: destinatário pelo começo do recado', () => {
  assert.deepEqual(parseCue('Solo: voz masculina'), { target: 'VOCAL', text: 'solo, voz masculina' });
  assert.deepEqual(parseCue('cai a canção...'), { target: 'ALL', text: 'cai a canção' });
  assert.deepEqual(parseCue('Guitarra: solo de 8 compassos'), { target: 'ELECTRIC_GUITAR', text: 'solo de 8 compassos' });
  assert.deepEqual(parseCue('Solo feminino - entrada suave'), { target: 'VOCAL', text: 'Solo feminino - entrada suave' });
  assert.deepEqual(parseCue('baixou o tom'), { target: 'ALL', text: 'baixou o tom' });
});

test('(2x) duplica a linha', () => {
  const { slides } = deriveSong(organizeLyrics('Santo, santo\nSanto és, Senhor (2x)'));
  assert.deepEqual(slides.map((s) => s.lines), [['SANTO, SANTO', 'SANTO ÉS, SENHOR', 'SANTO ÉS, SENHOR']]);
});

test('entrada suja: CRLF, tabs, espaços e linha enorme não quebram', () => {
  const longa = Array.from({ length: 60 }, (_, i) => `palavra${i}`).join(' ');
  const rows = organizeLyrics(`\r\n  \t \r\nLinha\tum\r\n   \r\n${longa}\r\n${'x'.repeat(400)}\r\n\r\n`);
  assert.ok(rows.length > 3);
  assert.ok(rows.every((r) => (r.text ?? '').length <= MAX_ROW_TEXT));
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  assert.ok(rows[0].part);
});

test('letra vazia ou só de espaços devolve documento vazio', () => {
  assert.deepEqual(organizeLyrics(''), []);
  assert.deepEqual(organizeLyrics(' \n\t\n'), []);
});
