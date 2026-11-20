# Palavras — slides por tópico, na identidade "painel" (plano)

Substitui o gerador de slides e a identidade visual M01–M04 (PR #36, nunca entrou na `qa`) por:

- O gerador que o pregador pediu: **um slide por tópico**, perto do número de pontos do esboço.
- A **identidade "painel"**, descrita em `docs/identidade-slides.md`. Esse arquivo é reescrito nesta tarefa, a partir do texto do usuário que está no fim deste plano.

## Por que

O gerador atual faz um slide para cada ponto, outro para cada versículo e um resumo de IA para cada parágrafo, ilustração e aplicação. Num sermão de 7 pontos isso dava dezenas de slides, de baixa qualidade.

O exemplo aprovado ("A agenda Profética está em Curso") tem 8 blocos no texto colado e virou 13 slides:

1. Capa: o título da palavra, com o versículo de abertura no painel.
2. Visão geral: o título da palavra e a lista numerada dos 7 pontos.
3. Cada ponto: "n. Título do ponto" no alto e o versículo no painel. Ponto com dois versículos vira dois slides com o mesmo título. Uma lista com marcadores tem slide próprio.

As opções de geração só dizem se o versículo entra no slide ou se fica só o título.

## Regras do gerador (puro, `apps/api/src/modules/sermons/sermon-slides.ts`, copiado em `apps/admin/src/features/sermons/lib/slides.ts`)

### Modos (`SlideMode`)

- `VERSES_AND_POINTS`, rótulo **"Com versículos"**:
  - capa;
  - visão geral;
  - para cada ponto, os slides dos versículos e das listas dele, ou o slide só com o título se ele não tiver nenhum.
- `TITLES`, rótulo **"Só títulos"** (valor novo do enum, migração `ALTER TYPE "SermonSlideMode" ADD VALUE 'TITLES'`):
  - capa só com o título;
  - visão geral;
  - um slide só com o título por ponto.
- `VERSES` e `FULL` continuam no enum só para linhas antigas. Ao ler, valem como `VERSES_AND_POINTS`. O DTO de geração aceita apenas `VERSES_AND_POINTS` e `TITLES`.

### Itens (`SlideItem`)

Os campos são `id`, `kind`, `sourceBlockId`, `text`, `reference`, `included`, `edited`, `layout`, `heading`, `items` e `version`. Saem `subtitle` e `subtitleEdited`.

`SlideLayout` passa a ser `'TITLE' | 'VERSE' | 'NUMBERED' | 'BULLETS'`.

| Slide | kind | layout | text | heading | items | reference |
|---|---|---|---|---|---|---|
| Capa sem versículo | TITLE | TITLE | título da palavra | null | null | null |
| Versículo (capa ou de um ponto) | VERSE | VERSE | o pedaço do versículo | título do contexto | null | "Livro c:v" |
| Ponto só com título | POINT | TITLE | "n. Título" | null | null | null |
| Visão geral | SUMMARY | NUMBERED | itens unidos por "\n" | título da palavra | títulos dos pontos, sem número | null |
| Lista com marcadores | SUMMARY | BULLETS | itens unidos por "\n" | título do contexto | itens | null |
| Anotação "Só para mim" | PRIVATE | TITLE | rótulo (como hoje) | null | null | null |

Ids estáveis, para o merge manter o que foi marcado ou editado:
- `title` para a capa sem versículo.
- `overview` para a visão geral; `overview:1` e assim por diante se ela for dividida.
- `${pointId}:title` para o ponto só com título.
- `${verseBlockId}:${n}` para os pedaços de versículo, numerados em ordem dentro do bloco.
- `${listIndex}` derivado do bloco: listas não têm id no documento, então use `list:${pointId ou 'opening'}:${k}:${n}`, onde k é a ordem da lista no contexto e n o pedaço.
- `${noteId}:0` para a anotação privada.

### Percurso do documento (só blocos de primeiro nível)

- **Contexto:**
  - antes do primeiro ponto ou título de seção, o contexto é a **abertura**, com o título da palavra como heading;
  - cada `point` abre um contexto numerado: n = ordem do ponto, a partir de 1, e o heading é `${n}. ${título}`. Uma numeração que o pregador já escreveu no começo ("1.", "1)", "I –", "Ponto 1:") é retirada antes de numerar de novo;
  - cada `heading` (nível 2 ou 3) abre um contexto sem número, com heading = o texto.
- **Versículos** (só em "Com versículos"):
  - cada versículo do bloco (`verses[i]`) vira os seus slides, um versículo por slide;
  - a referência é a do bloco com o número do versículo (`verseReference` como hoje, ex.: "Mateus 7:9");
  - versículo com `number: null` (texto colado) usa a referência do bloco;
  - versículo que não cabe no painel é dividido (ver "Caber");
  - a referência não leva mais " · BLIVRE": a identidade mostra só "Livro c:v". `version` continua guardado.
- **Listas** (`bulletList`/`orderedList`), só em "Com versículos":
  - um slide BULLETS por lista, com o texto de cada item (`listItem` → texto do primeiro parágrafo, sem as sublistas);
  - lista da **abertura** não gera slide quando há visão geral (no exemplo, essa lista é a própria visão geral).
- **Capa:**
  - em "Com versículos", com versículos na abertura: os slides VERSE desses versículos, com heading = título da palavra, no lugar do slide TITLE;
  - sem versículo na abertura, ou em "Só títulos": um slide TITLE;
  - sem título, sem capa.
- **Visão geral:** com 2 pontos ou mais, logo depois da capa.
- **Ponto:**
  - em "Com versículos", sem nenhum versículo nem lista, e em "Só títulos": um slide POINT com `n. Título`;
  - com conteúdo, sem slide só de título (o título já está no heading dos slides dele).
- **Parágrafo, ilustração, aplicação:** nenhum slide.
- **Ordem final:** capa, visão geral, depois os slides na ordem do documento. As anotações privadas vão no fim, como hoje.
- **Limite:** `SLIDE_LIMITS.items` continua.

### Referências dentro de listas

No texto de um item, cada trecho entre parênteses que `parseReference` reconhece é trocado por `formatReference` ("(Gn 37:5)" → "(Gênesis 37:5)"). O resto fica como está.

O admin não importa `bible-reference.ts`. A troca é feita **na API, ao gerar** (o item já sai normalizado) e no admin só na contagem (`countSlides`), que não precisa disso. O `lib/slides.ts` do admin é cópia do da API, então a função de normalização vem por parâmetro opcional: `buildSlides(title, doc, mode, normalizeRef?)`. A API passa a função; o admin não passa.

### Caber (nunca encolher a fonte)

Medidas de `docs/identidade-slides.md`, em px de uma tela 1920×1080. Estimativa por caracteres, com quebra de linha em palavra inteira. Ficam num objeto exportado `PANEL`, usado pelo gerador e pelo desenho:

- Área útil: 1920 − 2×128 = 1664 de largura; 1080 − 2×96 = 888 de altura.
- Título: 104 px, altura de linha 1.1. Até 26 caracteres por linha. Altura = linhas × 114,4.
- Entre título, traço e painel: 36 + 6 (traço) + 36.
- Painel: 1500 de largura. Respiro interno de 56 em cima e embaixo e de 96 nas laterais, o que deixa 1308 de largura útil.
- Versículo: 54 px, altura de linha 1.45 (78,3). Até 44 caracteres por linha. Aspa: 90 de altura e 24 de espaço até o texto. Referência: 24 de espaço e 46 de altura.
- Mensagem: 72 px, altura de linha 1.3. Ainda não usada pelo gerador.
- Marcadores: 46 px, altura de linha 1.4 (64,4). Até 48 caracteres por linha. 16 entre itens.
- Numerada: 44 px, altura de linha 1.25 (55). Até 46 caracteres por linha. 12 entre itens.
- Linhas que cabem no painel = (888 − altura do título − 78 − 112 − partes fixas) ÷ altura de linha, arredondado para baixo e no mínimo 2.
- Versículo que passa disso é dividido: primeiro numa fronteira de frase (`. ; : ? !`) que caiba, depois numa vírgula, por fim numa palavra. Todos os pedaços têm a mesma referência.
- Lista que passa é dividida entre itens: o mesmo heading, e os itens seguintes no próximo slide. Item que sozinho não cabe vai inteiro num slide.

### Face e contrato público

`SlideFace = { layout, title, verse, reference, items }`, em que `title` é o heading ou o texto, conforme a tabela.

`PublicSlide = { kind, text, reference } & SlideFace`, com `kind` em TITLE, VERSE, POINT ou SUMMARY.

O contrato com a Ponte e Cultos (`kind`, `text`, `reference`) não muda: SUMMARY leva os itens em `text`, separados por "\n".

`readDeliverySlides` e `parseStoredSlides` aceitam linhas antigas:
- layout desconhecido → padrão do kind (VERSE → VERSE; SUMMARY → BULLETS com `items = [text]`; o resto → TITLE);
- `subtitle` é ignorado;
- heading que falta → a referência (VERSE) ou ''.

### Merge e edição

- `mergeSlides` mantém `included` pelo id. Mantém o `text` editado só em TITLE e POINT, nunca em VERSE nem SUMMARY.
- `SermonSlidesService.save` aceita `text` só em TITLE e POINT, com limite de 120 caracteres. Sai `subtitle` do DTO.
- Sai todo o caminho "Slides completos":
  - `generateFull`, `aiTargets`, `summaryTargets`, `cleanDecisions` e `AiDecision`;
  - `SUMMARY_MAX`, `SermonSummarizer`, `SUMMARIZERS` e `AnthropicSummarizer` com o seu prompt e testes;
  - o `GenerationLimiter` dos slides.
- O que o "Colar texto" usa vai para `ai/anthropic-client.ts`: `createMessage`, `readResponseJson`, `toSummarizerError`, `ANTHROPIC_CLIENT_OPTIONS`, `supportsServerFallback` e `AnthropicMessagesClient`. `SummarizerError` continua em `ai/sermon-summarizer.ts`, só com a classe.
- `GET sermons/ai` continua, agora atendido pelo `SermonImportService`.

## Identidade (desenho, só no admin)

- `SlideStyle`: `MINIMAL` = **Verde** (padrão); `BACKGROUND` = **Azul-marinho**. Os nomes no enum ficam; mudam só o rótulo e as cores.

  | Variação | Fundo | Painel | Borda | Texto | Destaque |
  |---|---|---|---|---|---|
  | Verde | `#24352F` | `#2C3F38` | `#42584F` | `#F6F2EA` | `#E3B862` |
  | Azul-marinho | `#11223B` | `#182D4B` | `#2B4468` | `#F6F2EA` | `#E3B862` |

- Fonte única **Montserrat** (Google Fonts, pesos 500, 600, 700 e 800). Alternativas: Helvetica Neue, Arial, sans-serif. Sai a Palast, a Playfair e a Poppins; a `VITE_SLIDE_TITLE_FONT` e `public/fonts/` saem.
- `drawSlide(face, style)` (puro) devolve a geometria absoluta em 1920×1080:
  - o bloco inteiro centralizado na vertical: título, traço, painel;
  - o título centralizado na horizontal;
  - o painel com x = 210, largura 1500, raio 28 e borda de 2;
  - dentro do painel, conforme o layout:
    - VERSE: aspa “ dourada, texto centralizado e referência dourada em negrito com espaçamento de 2 px;
    - NUMBERED: número dourado em 800 e item em 600, alinhados à esquerda dentro do painel;
    - BULLETS: “•” dourado e item em 500. O trecho final entre parênteses vai em dourado negrito.
  - TITLE: só o título e o traço, sem painel, centralizados.
- A prévia (`SlidePreview`) e o `.pptx` usam o mesmo `drawSlide`:
  - prévia: posições absolutas, escaladas;
  - `.pptx` (pptxgenjs, 13,333 × 7,5 polegadas): px × 0,5 = pt; `roundRect` com `rectRadius`; fonte "Montserrat"; negrito nos pesos 700 e 800; transição fade, se a API do pptxgenjs permitir (senão fica de fora).
- O diálogo "Gerar slides" tem duas opções, "Com versículos" e "Só títulos", cada uma com a contagem, e as duas variações de cor. A escolha de modelo de IA e o aviso de IA saem.
- A lista de slides deixa de editar subtítulo. Mostra o rótulo do tipo (Capa, Versículo, Ponto, Visão geral, Lista) e edita só o título de Capa e Ponto.
- O diálogo de exportação avisa que o `.pptx` precisa da Montserrat instalada.

## Texto do usuário (fonte da identidade)

Reescrever `docs/identidade-slides.md` com o conteúdo das seções 1 a 8 do texto do usuário (conceito, paleta, tipografia, hierarquia, composição, tipos de slide, regras de texto e checklist), mais uma seção "Como o sistema aplica" com as regras deste plano. O texto do usuário está na tarefa do implementador.
