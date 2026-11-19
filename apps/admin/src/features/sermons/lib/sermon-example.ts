// Documento de exemplo e o que dele se deriva. Sem dependências além de tipos.
import type { DerivedSermon, SermonBlock, SermonDoc } from './document';

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

// ---- O exemplo aprovado dos slides: "A agenda Profética está em Curso" (13 slides em "Com versículos", 9 em "Só títulos").
// O mesmo de apps/api/src/modules/sermons/sermon-slides.spec.ts.

const verseOf = (id: string, reference: string, number: number, text: string): SermonBlock => ({
  type: 'verse',
  attrs: { id, reference, book: null, chapter: null, verseStart: null, verseEnd: null, translation: null, verses: [{ number, text }] },
});
const doc = (...content: SermonBlock[]): SermonDoc => ({ type: 'doc', content });
const point = (id: string, text: string): SermonBlock => ({ type: 'point', attrs: { id }, content: [{ type: 'text', text }] });
const para = (text: string): SermonBlock => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const bullets = (...items: string[]): SermonBlock => ({
  type: 'bulletList',
  content: items.map((text) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })),
});

export const AGENDA_TITLE = 'A agenda Profética está em Curso';
export const AGENDA_TOPICS = [
  'Uma Agenda de Poder',
  'Uma Agenda Guiada pelo Espírito Santo',
  'Uma Agenda de Fé',
  'Um Agenda para Reinar em Vida',
  'Uma Agenda que vai abalar tudo mais uma vez',
  'Uma Agenda de Tranferência de Riquezas',
  'Uma Agenda de Troca de Guarda',
];
const v = verseOf;
/** O que o "Colar texto" monta do texto que o pregador colou. */
export const AGENDA_DOC: SermonDoc = doc(
  v('is46', 'Isaías 46:10', 10, 'Que anuncio o fim desde o princípio, e desde a antiguidade as coisas que ainda não sucederam; que digo: O meu conselho será firme, e farei toda a minha vontade.'),
  bullets(...AGENDA_TOPICS),
  point('p1', AGENDA_TOPICS[0]),
  v('co1', '1 Coríntios 1:18', 18, 'A palavra da cruz é loucura para os que perecem; mas para nós, que somos salvos, é o poder de Deus.'),
  point('p2', AGENDA_TOPICS[1]),
  v('co2', '1 Coríntios 2:13', 13, 'As quais também falamos, não com palavras que a sabedoria humana ensina, mas com as que o Espírito Santo ensina, comparando as coisas espirituais com as espirituais.'),
  point('p3', `3. ${AGENDA_TOPICS[2]} `), // numeração escrita pelo pregador: sai antes de numerar de novo
  v('mt9', 'Mateus 7:9', 9, '"Qual de vocês, se seu filho pedir pão, lhe dará uma pedra?'),
  v('mt11', 'Mateus 7:11', 11, 'Se vocês, apesar de serem maus, sabem dar boas coisas aos seus filhos, quanto mais o Pai de vocês, que está nos céus, dará coisas boas aos que lhe pedirem!'),
  point('p4', AGENDA_TOPICS[3]),
  v('rm', 'Romanos 5:17', 17, 'Porque, se pela ofensa de um só, a morte reinou por esse, muito mais os que recebem a abundância da graça, e do dom da justiça, reinarão em vida por um só, Jesus Cristo.'),
  point('p5', AGENDA_TOPICS[4]),
  v('ag', 'Ageu 2:6', 6, 'Porque assim diz o Senhor dos Exércitos: Ainda uma vez, daqui a pouco, farei tremer os céus e a terra, o mar e a terra seca;'),
  v('is13', 'Isaías 13:13', 13, 'Por isso farei estremecer os céus; e a terra se moverá do seu lugar, por causa do furor do Senhor dos Exércitos, e por causa do dia da sua ardente ira.'),
  point('p6', AGENDA_TOPICS[5]),
  v('dt17', 'Deuteronômio 8:17', 17, 'Não digam, pois, em seu coração: "A minha capacidade e a força das minhas mãos ajuntaram para mim toda esta riqueza".'),
  para(''),
  v('dt18', 'Deuteronômio 8:18', 18, 'Mas, lembrem-se do Senhor, do seu Deus, pois é ele que lhes dá a capacidade de produzir riqueza, confirmando a aliança que jurou aos seus antepassados, conforme hoje se vê.'),
  point('p7', AGENDA_TOPICS[6]),
  bullets(
    'Deus visitou José em sonhos: ele sustentaria Israel no Egito (Gn 37:5)',
    'Deus visitou Moises em visão na sarça ardente: (Ex 3:2)',
    'Deus visitou Salomão em sonho: pede-me... (l Reis 3.5)',
  ),
  v('sl', 'Salmos 101:6', 6, 'Meus olhos aprovam os fiéis da terra, e eles habitarão comigo. Somente quem tem vida íntegra me servirá.'),
);
