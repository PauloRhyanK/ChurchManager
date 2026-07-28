/**
 * Registry das secções editáveis do site público.
 *
 * É a única fonte de verdade: define que chaves existem, que campos cada uma
 * tem, como se validam e qual o conteúdo inicial (o que está hoje hardcoded no
 * repositório do site). O painel lê este mesmo registry via API e desenha o
 * formulário a partir dele — acrescentar um campo é uma linha aqui, sem tocar
 * no frontend.
 */

export type SiteFieldType =
  | 'text'
  | 'textarea'
  | 'url'
  | 'image'
  | 'icon'
  | 'boolean'
  | 'list';

export interface SiteFieldSpec {
  name: string;
  label: string;
  type: SiteFieldType;
  /** Texto de apoio mostrado por baixo do campo no painel. */
  help?: string;
  required?: boolean;
  maxLength?: number;
  /** Só para `type: 'list'` — rótulo singular de cada item ("Igreja", "Pastor"). */
  itemLabel?: string;
  /** Só para `type: 'list'`. */
  maxItems?: number;
  /** Só para `type: 'list'` — campos de cada item. */
  fields?: SiteFieldSpec[];
}

export interface SiteSectionSpec {
  key: string;
  title: string;
  description: string;
  /** Nome do ícone lucide usado no card do painel. */
  icon: string;
  fields: SiteFieldSpec[];
  defaults: Record<string, unknown>;
}

/**
 * Ícones permitidos nos campos `type: 'icon'`. Restringir a um conjunto fechado
 * evita que um erro de escrita rebente o render do site, que faz lookup por nome.
 */
export const SITE_ICONS = [
  'Heart',
  'Users',
  'BookOpen',
  'MapPin',
  'Music',
  'Church',
  'Calendar',
  'Star',
  'Sparkles',
  'HandHeart',
  'Baby',
  'Flame',
  'Globe',
  'Phone',
  'Mail',
] as const;

export type SiteIcon = (typeof SITE_ICONS)[number];

const TEXT_MAX = 500;
const LONG_TEXT_MAX = 5000;

export const SITE_SECTIONS: SiteSectionSpec[] = [
  {
    key: 'mission',
    title: 'Missão / Sobre',
    description: 'Secção "Nossa Missão" da home — títulos, parágrafos e citação.',
    icon: 'Church',
    fields: [
      { name: 'badge', label: 'Etiqueta', type: 'text', maxLength: 60 },
      { name: 'titlePart1', label: 'Título — 1.ª parte', type: 'text', maxLength: 120 },
      {
        name: 'titleHighlight',
        label: 'Título — parte destacada',
        type: 'text',
        maxLength: 120,
        help: 'Renderizada a verde e em itálico no site.',
      },
      { name: 'titlePart2', label: 'Título — 3.ª parte', type: 'text', maxLength: 120 },
      { name: 'paragraph1', label: '1.º parágrafo', type: 'textarea', maxLength: LONG_TEXT_MAX },
      { name: 'paragraph2', label: '2.º parágrafo', type: 'textarea', maxLength: LONG_TEXT_MAX },
      { name: 'quote', label: 'Citação', type: 'textarea', maxLength: TEXT_MAX },
      { name: 'signature', label: 'Assinatura', type: 'text', maxLength: 120 },
    ],
    defaults: {
      badge: 'Nossa Missão',
      titlePart1: 'O mesmo povo.',
      titleHighlight: 'A mesma fé.',
      titlePart2: 'Um nome novo.',
      paragraph1:
        'Agora, somos a Igreja Paraíso. O mesmo povo, a mesma igreja, com um novo nome, uma nova mentalidade e uma visão renovada.',
      paragraph2:
        'E o nosso compromisso permanece: alcançar todos a quem o Senhor nos enviar.',
      quote:
        'Paraíso é a casa de Deus, o lugar da presença, onde a minha família se reúne, onde Deus habita.',
      signature: 'Igreja Paraíso — Casa de Deus. Minha família.',
    },
  },

  {
    key: 'celulas',
    title: 'Células',
    description: 'Secção "Grupos de Vida" — textos, versículo e benefícios.',
    icon: 'Users',
    fields: [
      { name: 'badge', label: 'Etiqueta', type: 'text', maxLength: 60 },
      { name: 'titlePart1', label: 'Título — 1.ª parte', type: 'text', maxLength: 120 },
      { name: 'titleHighlight', label: 'Título — parte destacada', type: 'text', maxLength: 120 },
      { name: 'titlePart2', label: 'Título — 3.ª parte', type: 'text', maxLength: 120 },
      { name: 'paragraph1', label: '1.º parágrafo', type: 'textarea', maxLength: LONG_TEXT_MAX },
      { name: 'paragraph2', label: '2.º parágrafo', type: 'textarea', maxLength: LONG_TEXT_MAX },
      { name: 'verseText', label: 'Versículo', type: 'textarea', maxLength: TEXT_MAX },
      { name: 'verseReference', label: 'Referência do versículo', type: 'text', maxLength: 60 },
      {
        name: 'benefits',
        label: 'Benefícios',
        type: 'list',
        itemLabel: 'Benefício',
        maxItems: 8,
        fields: [
          { name: 'icon', label: 'Ícone', type: 'icon' },
          { name: 'titulo', label: 'Título', type: 'text', required: true, maxLength: 80 },
          { name: 'descricao', label: 'Descrição', type: 'textarea', maxLength: TEXT_MAX },
        ],
      },
      { name: 'ctaLabel', label: 'Texto do botão', type: 'text', maxLength: 80 },
      { name: 'ctaUrl', label: 'Link do botão', type: 'url' },
    ],
    defaults: {
      badge: 'Grupos de Vida',
      titlePart1: 'A igreja',
      titleHighlight: 'acontece',
      titlePart2: 'em células.',
      paragraph1:
        'Células são grupos pequenos onde a vida em comunidade realmente acontece. É onde você encontra amigos, cresce na fé e descobre o seu propósito — sem grandes palcos, só presença e verdade.',
      paragraph2: 'Acreditamos que ninguém deveria seguir essa caminhada sozinho.',
      verseText:
        'Onde dois ou três se reúnem em meu nome, ali estou eu no meio deles.',
      verseReference: 'Mateus 18:20',
      benefits: [
        {
          icon: 'Heart',
          titulo: 'Comunhão Real',
          descricao:
            'Relacionamentos genuínos construídos em torno da fé, onde cada pessoa é conhecida pelo nome.',
        },
        {
          icon: 'BookOpen',
          titulo: 'Crescimento Espiritual',
          descricao:
            'Estudo bíblico aplicado ao cotidiano, com espaço para perguntas e reflexão em grupo.',
        },
        {
          icon: 'Users',
          titulo: 'Família de Verdade',
          descricao:
            'Grupos pequenos onde ninguém passa por momentos difíceis sozinho. Somos família.',
        },
        {
          icon: 'MapPin',
          titulo: 'Perto de Você',
          descricao:
            'Células espalhadas pela cidade para que você encontre uma próxima de onde você vive.',
        },
      ],
      ctaLabel: 'Quero encontrar uma célula',
      ctaUrl: '/membros',
    },
  },

  {
    key: 'visit',
    title: 'Venha nos visitar',
    description:
      'Bloco de endereço e horários da sede. A home atual do site já não inclui esta secção; o conteúdo permanece disponível na API.',
    icon: 'MapPin',
    fields: [
      { name: 'titlePart1', label: 'Título — 1.ª linha', type: 'text', maxLength: 120 },
      { name: 'titleHighlight', label: 'Título — parte destacada', type: 'text', maxLength: 120 },
      {
        name: 'backgroundImage',
        label: 'Imagem de fundo',
        type: 'image',
        help: 'Fica a preto e branco até o visitante passar o rato por cima.',
      },
      { name: 'addressTitle', label: 'Título do cartão de endereço', type: 'text', maxLength: 80 },
      {
        name: 'address',
        label: 'Endereço',
        type: 'textarea',
        maxLength: TEXT_MAX,
        help: 'Uma linha por linha mostrada no site.',
      },
      { name: 'hoursTitle', label: 'Título do cartão de horários', type: 'text', maxLength: 80 },
      {
        name: 'hours',
        label: 'Horários',
        type: 'textarea',
        maxLength: TEXT_MAX,
        help: 'Confirme que batem com a Programação — hoje há divergências entre as duas.',
      },
      { name: 'mapsUrl', label: 'Link "Como chegar"', type: 'url' },
    ],
    defaults: {
      titlePart1: 'VENHA NOS',
      titleHighlight: 'visitar',
      backgroundImage:
        'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?q=80&w=2000',
      addressTitle: 'Endereço (Sede)',
      address:
        'Rua Helmut Gums, 438 - Virada\nSanta Maria de Jetibá - ES\nCEP 29645-000',
      hoursTitle: 'Horários',
      hours:
        'Domingo: 09h e 18h30\nTerça-feira: 20h00 (Doutrina e Oração)\nSábado: 19h00 (Juventude Eleve)',
      mapsUrl: 'https://maps.app.goo.gl/UsxnnZ69miAvFzvs6',
    },
  },

  {
    key: 'churches',
    title: 'Igrejas & Missões',
    description:
      'Home e página Nossas Igrejas. O endereço completo de cada filial alimenta o mapa embutido e o texto — preencha com rua, nº, bairro e cidade.',
    icon: 'Globe',
    fields: [
      { name: 'badge', label: 'Etiqueta', type: 'text', maxLength: 60 },
      { name: 'titlePart1', label: 'Título — 1.ª linha', type: 'text', maxLength: 120 },
      { name: 'titleHighlight', label: 'Título — parte destacada', type: 'text', maxLength: 120 },
      { name: 'intro', label: 'Parágrafo de introdução', type: 'textarea', maxLength: LONG_TEXT_MAX },
    ],
    defaults: {
      badge: 'Nossa Presença',
      titlePart1: 'NOSSAS',
      titleHighlight: 'igrejas & missões',
      intro:
        'Estamos presentes em diversas cidades através de nossas filiais e campos missionários, servindo às famílias locais com amor e dedicação.',
    },
  },

  {
    key: 'pastors',
    title: 'Time Pastoral',
    description: 'Página /time-pastoral — o site mostra apenas nome e foto de cada pastor.',
    icon: 'HandHeart',
    fields: [
      { name: 'badge', label: 'Etiqueta', type: 'text', maxLength: 60 },
      { name: 'titlePart1', label: 'Título — 1.ª linha', type: 'text', maxLength: 120 },
      { name: 'titleHighlight', label: 'Título — parte destacada', type: 'text', maxLength: 120 },
      { name: 'intro', label: 'Parágrafo de introdução', type: 'textarea', maxLength: LONG_TEXT_MAX },
    ],
    defaults: {
      badge: 'Nosso Time',
      titlePart1: 'TIME',
      titleHighlight: 'pastoral',
      intro: '',
    },
  },

  {
    key: 'giving',
    title: 'Ofertório',
    description: 'Chave PIX e dados bancários mostrados na secção de dízimos.',
    icon: 'HandHeart',
    fields: [
      { name: 'badge', label: 'Etiqueta', type: 'text', maxLength: 60 },
      { name: 'titlePart1', label: 'Título — 1.ª parte', type: 'text', maxLength: 120 },
      { name: 'titleHighlight', label: 'Título — parte destacada', type: 'text', maxLength: 120 },
      { name: 'titlePart2', label: 'Título — 3.ª parte', type: 'text', maxLength: 120 },
      { name: 'intro', label: 'Parágrafo de introdução', type: 'textarea', maxLength: LONG_TEXT_MAX },
    ],
    defaults: {
      badge: 'Dízimos e Ofertas',
      titlePart1: 'Sua contribuição',
      titleHighlight: 'edifica',
      titlePart2: 'vidas.',
      intro:
        'Acreditamos que a generosidade é uma resposta de amor à graça de Deus. Ao contribuir, você apoia as ações sociais, o sustento da igreja local e os projetos de expansão do Reino de Deus.',
    },
  },

  {
    key: 'contact',
    title: 'Contato & Rodapé',
    description: 'Telefone, endereço, redes sociais e copyright do rodapé.',
    icon: 'Phone',
    fields: [
      { name: 'tagline', label: 'Tagline', type: 'text', maxLength: 200 },
      { name: 'copyright', label: 'Copyright', type: 'text', maxLength: 200 },
    ],
    defaults: {
      tagline: 'Casa de Deus. Minha família.',
      copyright: '© 2026 Igreja Paraíso. Feitos para a Eternidade.',
    },
  },

  {
    key: 'youtube',
    title: 'Transmissões',
    description: 'Canal de onde a secção "Última Transmissão" puxa os vídeos.',
    icon: 'Globe',
    fields: [
      {
        name: 'channelHandle',
        label: 'Handle do canal',
        type: 'text',
        maxLength: 80,
        help: 'Sem o @. O site liga para @paraisoigreja mas busca vídeos de ibrejetibaoficial — confirme qual é o correto.',
      },
      { name: 'sectionTitle', label: 'Título da secção', type: 'text', maxLength: 120 },
    ],
    defaults: {
      channelHandle: 'paraisoigreja',
      sectionTitle: 'Última Transmissão',
    },
  },
];

export const SITE_SECTION_KEYS = SITE_SECTIONS.map((section) => section.key);

export function findSectionSpec(key: string): SiteSectionSpec | undefined {
  return SITE_SECTIONS.find((section) => section.key === key);
}
