# Palavras: o gestor de sermões do pregador

Data: 19/11/2026 · Branch: `claude/palavras-pregador-0fc79e` (entra pela `qa`).
Telas aprovadas: https://claude.ai/artifact/QU7o3ybrFftbDyX6hugHLu (`PalavraLista`, `Palavra`, `PalavraVersiculo`, `PalavraSlides`, `PalavraEnviar`, `PalavraCulto`, `PalavraExportar`, e a linha "Palavra" de `Roteiro`). Os textos de sermão ali são inventados.

**Situação:** aprovada em 19/11/2026. As etapas 1 a 5 estão implementadas (planos em `docs/superpowers/plans/2026-11-19-palavras-etapa-*.md`). Falta a etapa 6 (Ponte). A etapa 5 só liga quando a chave do provedor está no ambiente do servidor; a chamada real ao provedor ainda não foi exercitada (ver `apps/api/src/modules/sermons/ai/README.md`).

**O que a implementação decidiu além do que está abaixo:**

- **Bíblia:** só os 22 marcadores de acróstico do Salmo 119 são removidos na importação; as palavras supridas e os rótulos de fala entre colchetes da Bíblia Livre ("[assim]", "[Ela] :") ficam como na edição. A busca por trecho ignora pontuação, separa palavras com hífen e traz a frase exata primeiro. Em livro de um capítulo só, "jd 3" é o versículo 3. Em QA e produção a importação roda dentro do contêiner da API (`apps/api/src/modules/sermons/bible/README.md`).
- **Slides:** cada item tem id `<bloco>:<n>`; "Atualizar" casa por esse id. Título e ponto com mais de 300 caracteres são cortados na geração. Mudar só o título também marca os slides como desatualizados. Palavra sem slides continua podendo ser enviada pelo editor; com slides, o envio fica na conferência. Palavra pregada tem os slides só para leitura.
- **IA (decisão do usuário em 19/11/2026: Anthropic, sem ficar preso a um modelo):** a chamada fica atrás da interface `SermonSummarizer`, com um registro de provedores; o primeiro é a Anthropic, pelo SDK oficial. A chave vem de `ANTHROPIC_API_KEY` no ambiente do servidor (uma para a plataforma); os modelos vêm de `SERMON_AI_MODELS` (lista `provedor:modelo`, o primeiro é o padrão; sem a variável, `claude-opus-5-5`), e o painel deixa escolher quando há mais de um. São resumidos a Abertura, cada Ilustração, cada Aplicação e cada seção com título; pontos e versículos não. Limite de 10 gerações por pessoa por hora. Sem chave, a opção continua desligada.
- **Exportar:** a caixa das anotações volta desmarcada toda vez que o diálogo abre. A apresentação sai com um slide por item marcado; o PDF e o texto levam o crédito da tradução.

## Problema

O pregador escreve o sermão num editor de texto qualquer, monta os slides em outro programa e avisa a equipe de multimídia por mensagem. Quem monta o roteiro do culto não sabe o título nem tem os slides até a hora.

Este módulo dá ao pregador um lugar só para escrever a palavra, tirar os slides dela e entregá-la a um culto. O roteiro recebe o título e os slides; o esboço e as anotações privadas ficam só com quem escreveu.

## Decisões já tomadas (não reabrir)

- Item de menu **Palavras**, separado de **Cultos**, com permissão própria.
- Biblioteca com título, texto base, situação (Rascunho; Enviada com a data do culto; Pregada), busca por título ou versículo, filtros e "Nova palavra".
- Editor de documento em tela cheia, sem o menu lateral, folha no centro. Barra de cima: voltar, título, "Salvo", tempo de fala, Exportar, "Gerar slides". Ferramentas: estilo do texto, negrito, itálico, lista, e cinco blocos: Versículo, Ponto, Ilustração, Aplicação e "Só para mim". Coluna à esquerda com a estrutura (com minutos) e os versículos usados.
- Inserir versículo por referência abreviada ou por trecho, com tradução e intervalo.
- Gerar slides: "Só versículos", "Versículos e pontos" ou "Slides completos"; visual "Minimalista" ou "Com fundo"; depois a tela de conferência (tirar, reordenar, prévia).
- Enviar para um culto já criado ou para "Outra data"; sem culto na data, a palavra fica guardada e entra sozinha quando ele for criado. Casamento por data e hora; culto que já tem palavra pede confirmação para trocar; cada pregador vê só as próprias palavras; o roteiro vê só título e slides.
- Exportar: sermão em PDF, slides em apresentação, versículos em texto; anotações privadas só se marcado.
- Avançar os slides no culto (pregador pelo celular, operador) é da Ponte, em outra sessão.

## Decisões que são do usuário

Cada uma está detalhada na seção indicada, com opções e recomendação.

1. **Texto bíblico** (§ Bíblia): começar com a **Bíblia Livre (BLIVRE)**, baseada em Almeida 1819, licença CC BY 4.0. Confirma?
2. **IA** (§ O que é IA e o que não é): só "Slides completos" precisa de modelo de linguagem. **Qual provedor e de quem é a chave?** Nada é assumido; sem resposta, a opção aparece desligada.
3. **Exportar** (§ Exportar): PDF pela impressão do navegador e apresentação gerada no navegador com `pptxgenjs`. Confirma?
4. **Editor** (§ O editor): Tiptap. Confirma?
5. **"Só para mim" na conferência dos slides** (§ Slides): aparece desmarcada e **travada**, ou pode ser marcada pelo pregador? Recomendação: travada.
6. **Tempo de fala** (§ Tempo de fala): a fórmula proposta precisa ser calibrada com um sermão real do pastor.
7. Regras assumidas que vale conferir (§ Envio): uma palavra vai para um culto só de cada vez; quem tem a permissão pode trocar a palavra de outro pregador num culto, depois de confirmar; nem o administrador da igreja lê o esboço dos outros.

## Visão geral

Três peças, com fronteiras claras:

- **Palavra** (`Sermon`): o documento do pregador. Só o autor lê e escreve.
- **Envio** (`SermonDelivery`): a entrega de uma palavra a uma data. Guarda uma **cópia** só do que é público (título, nome do pregador, slides). É a única coisa que o módulo Cultos lê. A privacidade vale por construção: o roteiro nunca consulta a tabela das palavras.
- **Bíblia** (`BibleTranslation`, `BibleVerse`): texto de consulta, global, sem tenant.

```
Palavras (autor)                    Cultos (roteiro)
┌──────────────┐  enviar  ┌────────────────┐  lê   ┌────────────────┐
│ Sermon       │ ───────▶ │ SermonDelivery │ ◀──── │ WorshipService │
│ documento    │  cópia   │ título, slides │       │ momento Palavra│
│ slides       │  pública │ data e hora    │       └────────────────┘
└──────────────┘          └────────────────┘
```

## Modelo de dados

Prisma. Tabelas `sermons`, `sermon_deliveries`, `bible_translations`, `bible_verses`. As duas primeiras com `tenantId` e `onDelete: Cascade` a partir do tenant.

### Palavra: uma linha, com o documento em JSON

Mesmo raciocínio das músicas do módulo Cultos: o documento é editado inteiro e salvo inteiro, então blocos, versículos citados e slides **não** viram tabelas. O que a lista precisa filtrar e mostrar fica em colunas, recalculadas pelo servidor a cada escrita.

`Sermon` (`sermons`):

| Campo | Tipo | Nota |
|---|---|---|
| `id`, `tenantId`, `createdAt`, `updatedAt` | | |
| `authorId` | Uuid → `AdminUser`, `Cascade` | o dono; todo acesso filtra por ele |
| `title` | VarChar(255) | "Sem título" ao criar |
| `document` | Json | o documento do editor (§ O editor) |
| `revision` | Int, começa em 0 | soma 1 a cada escrita do documento; evita que duas abas se sobrescrevam |
| `baseReference` | VarChar(120)? | derivado: referência do primeiro bloco Versículo ("João 8:12") |
| `pointCount` | Int | derivado: quantos blocos Ponto |
| `verseRefs` | Text | derivado: as referências citadas, normalizadas (sem acento, minúsculas), para a busca |
| `estimatedSeconds` | Int | derivado: tempo de fala (§ Tempo de fala) |
| `slideMode` | enum `SermonSlideMode`? | `VERSES`, `VERSES_AND_POINTS`, `FULL`; nulo enquanto não gerou |
| `slideStyle` | enum `SermonSlideStyle` | `MINIMAL` (padrão), `BACKGROUND` |
| `slides` | Json | a sequência conferida (§ Slides); `[]` enquanto não gerou |
| `slidesRevision` | Int? | `revision` do documento quando os slides foram tirados; diferente do atual = "o esboço mudou" |

Índices: `(tenantId, authorId, updatedAt)`.

A **situação** não é coluna. É calculada na leitura a partir do envio:

- **Rascunho:** não tem envio.
- **Enviada · dom 22/11, 19h:** tem envio e a data e hora ainda não passaram, no fuso de Brasília (`America/Sao_Paulo`). O tenant ainda não tem fuso próprio no banco; a conta fica atrás de `SermonsService.timeZone()`, um lugar só para trocar quando tiver. Quando o envio ainda não casou com nenhum culto, a lista mostra o mesmo texto e o detalhe diz "guardada até o culto ser criado".
- **Pregada · dom 15/11:** tem envio e a data e hora já passaram, tenha ele casado com um culto ou não: o pregador disse que pregaria naquele dia.

### Envio: a cópia pública

`SermonDelivery` (`sermon_deliveries`):

| Campo | Tipo | Nota |
|---|---|---|
| `id`, `tenantId`, `createdAt`, `updatedAt` | | |
| `sermonId` | Uuid? → `Sermon`, `SetNull`, **único** | uma palavra tem no máximo um envio; nulo se a palavra foi apagada depois de pregada |
| `authorId` | Uuid? → `AdminUser`, `SetNull` | |
| `date` | Date | a data pedida |
| `startTime` | VarChar(5) | `HH:MM`, a hora pedida |
| `serviceId` | Uuid? → `WorshipService`, `SetNull`, **único** | o culto com que casou; nulo = guardada. Um culto tem no máximo uma palavra |
| `pinned` | Boolean | `true` quando o pregador escolheu um culto da lista; `false` quando informou "Outra data" |
| `title` | VarChar(255) | cópia |
| `preacherName` | VarChar(255) | cópia do nome do autor |
| `slideStyle` | enum `SermonSlideStyle` | cópia |
| `slides` | Json | cópia: só os itens marcados, na ordem, **nunca** um item `PRIVATE`; `[]` enquanto a palavra não tem slides |
| `estimatedSeconds` | Int | cópia do tempo de fala, para o roteiro mostrar |

Índices: `(tenantId, date)`.

A cópia é refeita pelo servidor sempre que o autor salva o título ou os slides de uma palavra **Enviada**; o roteiro vê sempre a versão atual. Depois de **Pregada**, a cópia congela e vira o registro do que foi ao telão.

### Bíblia

`BibleTranslation` (`bible_translations`): `code` VarChar(16) único (`BLIVRE`), `name` VarChar(120) ("Bíblia Livre"), `shortName` VarChar(32) (o que aparece no seletor), `license` VarChar(255), `attribution` Text (o crédito exigido pela licença), `sourceUrl` VarChar(512), `sourceVersion` VarChar(32) (data da edição importada), `isDefault` Boolean.

`BibleVerse` (`bible_verses`): `translationId` (Cascade), `book` SmallInt (1 a 66, ordem protestante), `chapter` SmallInt, `verse` SmallInt, `text` Text, `searchText` Text (o texto sem acento e em minúsculas, gravado na importação). Único `(translationId, book, chapter, verse)`.

Cerca de 31 mil linhas por tradução. A busca por trecho é um `LIKE` em `searchText`; nesse tamanho responde em milissegundos e não pede extensão do Postgres (o projeto não usa nenhuma hoje).

### Mudança no módulo Cultos

`WorshipMomentKind` hoje tem `PRE_SERVICE`, `GENERIC`, `WORSHIP`, e o momento "Palavra" do Culto padrão é `GENERIC`. Entra o valor **`SERMON`** (migração `ALTER TYPE … ADD VALUE`):

- o momento "Palavra" do Culto padrão passa a `SERMON`;
- a migração marca como `SERMON` os momentos já gravados cujo nome é "Palavra" (em `worship_service_moments` e dentro do JSON de `worship_service_templates`);
- a tela de momentos do roteiro passa a oferecer o tipo "Palavra".

O vínculo é com o **culto**, não com o momento: um culto tem uma palavra. O momento `SERMON` é só onde ela aparece na tela.

## Permissão e privacidade

Novo valor **`SERMONS`** em `PermissionModule`. `VIEW` lê as próprias palavras; `EDIT` cria, altera, gera slides, envia e apaga. Entra em `PERMISSION_MODULES` (API e painel) com rótulo **Palavras** ("Sermões do pregador: esboço, slides e envio para o culto"), em `auth-storage.ts`, e num modelo de grupo novo **Pregadores** (`SERMONS: EDIT`).

Regras, todas no servidor:

1. **Dono vê tudo, e só o dono.** Toda consulta a `sermons` leva `tenantId` **e** `authorId = user.userId`. Palavra de outro autor responde 404, igual a id de outro tenant. Isso vale também para `TENANT_ADMIN` e `PLATFORM_ADMIN`: o `PermissionsGuard` libera a rota para eles, mas o filtro por autor fica no serviço e não tem exceção. Ser dono não é permissão, é filtro.
2. **O roteiro vê só o envio.** As rotas de Cultos leem `sermon_deliveries` e devolvem `title`, `preacherName`, `slideStyle`, `slides` e a contagem. Nenhuma rota de Cultos faz `include` de `Sermon`.
3. **"Só para mim" nunca sai.** O servidor descarta itens `PRIVATE` ao montar a cópia do envio, mesmo que o corpo da requisição os marque. O texto dos blocos privados nunca é mandado a um modelo de linguagem.
4. O pregador não precisa de permissão em Cultos: a lista de cultos para enviar vem de uma rota do próprio módulo Palavras.

Consequência da regra 1: se o usuário do pregador for apagado, as palavras dele são apagadas junto (`Cascade`); o que já foi pregado continua no roteiro pela cópia do envio.

## O editor

### Biblioteca: Tiptap ou Lexical

O `apps/admin` não tem editor de texto instalado. Tem `@dnd-kit` (serve à conferência dos slides), `cmdk` (serve ao diálogo de versículo) e `@tailwindcss/typography`. O editor de letra do módulo Cultos é feito à mão sobre `contentEditable`, o que serve a uma lista plana de linhas, mas não a um documento com negrito, listas e blocos aninhados.

| | **Tiptap** (sobre ProseMirror) | **Lexical** (Meta) |
|---|---|---|
| Blocos próprios | `Node.create` + `ReactNodeViewRenderer`: um componente React por bloco, com conteúdo editável dentro | `ElementNode`/`DecoratorNode` + plugins; bloco com conteúdo editável aninhado dá mais trabalho |
| Formato salvo | JSON do ProseMirror, com esquema declarado: o que não está no esquema não entra | JSON próprio do estado do editor, preso à versão das classes de nó |
| Básico pronto | `StarterKit` (parágrafo, título, negrito, itálico, listas, histórico) | pacotes separados por recurso, mais montagem |
| Maturidade | ProseMirror é estável há anos; documentação farta | núcleo mais leve e novo; menos exemplo de bloco próprio |
| Peso | maior | menor |
| Licença | MIT (núcleo e extensões usadas) | MIT |

**Recomendação: Tiptap.** Os cinco blocos de sermão são o centro da tela, e é neles que o Tiptap dá menos trabalho; o esquema declarado é o mesmo que o servidor valida. O peso maior não pesa: a rota do editor é carregada sob demanda (`React.lazy`). Pacotes: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, com versão exata fixada como o `@dnd-kit`. Só extensões de código aberto; nada do Tiptap pago (colaboração, IA, comentários).

### Formato de armazenamento

O campo `document` guarda o JSON do ProseMirror como o Tiptap o produz, restrito a este esquema:

```ts
type Doc = { type: 'doc'; content: Block[] };

type Block =
  | { type: 'paragraph'; content?: Inline[] }
  | { type: 'heading'; attrs: { id: string; level: 2 | 3 }; content?: Inline[] } // "Título de seção" e "Subtítulo"
  | { type: 'bulletList'; content: ListItem[] }
  | { type: 'orderedList'; attrs?: { start?: number; type?: string | null }; content: ListItem[] } // o Tiptap grava `start` (inteiro ≥ 1) e `type` (até 8 caracteres)
  | { type: 'point'; attrs: { id: string }; content?: Inline[] }                 // Ponto: o número vem da ordem
  | { type: 'verse'; attrs: VerseAttrs }                                          // Versículo: bloco fechado
  | { type: 'illustration' | 'application' | 'privateNote'; attrs: { id: string }; content: Inner[] };

type Inner = Extract<Block, { type: 'paragraph' | 'bulletList' | 'orderedList' }>;
type ListItem = { type: 'listItem'; content: Inner[] };
type Inline = { type: 'text'; text: string; marks?: { type: 'bold' | 'italic' }[] } | { type: 'hardBreak' };

type VerseAttrs = {
  id: string;
  reference: string;          // "João 8:12" ou "Mateus 5:14-16", como aparece na tela
  book: number | null;        // 1–66; nulo quando digitado à mão sem referência reconhecida
  chapter: number | null;
  verseStart: number | null;
  verseEnd: number | null;
  translation: string | null; // código da tradução ("BLIVRE"); nulo quando digitado à mão
  verses: { number: number | null; text: string }[]; // o texto, copiado para dentro do documento
};
```

Pontos do formato:

- **O título não está no documento.** O título grande no topo da folha é um campo ligado à coluna `title`; a barra de cima mostra o mesmo valor.
- **O texto do versículo é copiado para dentro do bloco.** O sermão não muda se a tradução for trocada ou reimportada, e o versículo pode ser **digitado à mão** (referência e texto livres). Isso também deixa o pregador colar o texto da tradução que ele usa, sem o sistema distribuir uma Bíblia com dono.
- **`id` nos blocos** (uuid gerado no cliente) liga cada slide ao bloco de onde saiu.
- **Estilo do texto** ("Texto" na barra): Texto normal, Título de seção (`heading` 2), Subtítulo (`heading` 3).
- Colar traz só texto e o que o esquema aceita; o resto é descartado pelo editor.

**Validação no servidor.** O DTO declara `document` como objeto e aplica um validador próprio (`validateSermonDocument`, função pura): percorre a árvore e recusa com 400 qualquer tipo de nó, atributo ou marca fora do esquema acima. Limites: 3.000 nós, 300.000 caracteres de texto, 8 níveis de profundidade, `id` até 36 caracteres, `reference` até 120, até 200 versículos por bloco. É o equivalente, para uma árvore, do whitelist do `ValidationPipe`. O editor é feito para nunca produzir o que o validador recusa: lista dentro de lista para de aceitar Tab no limite de profundidade, e item de lista só aceita parágrafo e lista.

**Derivação.** Uma função pura (`deriveSermon(document)`), igual na API e no painel, como o `worship-document.ts`, produz: as seções da estrutura, os versículos citados, `baseReference`, `pointCount`, `verseRefs` e o tempo de fala. O painel usa para a coluna da esquerda sem ir ao servidor; a API usa para gravar as colunas derivadas. Um teste com o mesmo documento de exemplo dos dois lados garante que não divergem.

### Estrutura (coluna da esquerda)

Uma seção começa em cada bloco **Ponto** e em cada **Título de seção**:

- **Abertura:** tudo antes da primeira seção. Não aparece se estiver vazia.
- **1. A luz chama**, **2. …:** de um Ponto até a próxima seção. O número é a posição entre os Pontos.
- **Conclusão** (ou o nome que o pregador der): um Título de seção, sem número. O botão "Texto › Título de seção" depois do último ponto é como se cria a Conclusão.

Clicar numa seção rola a folha até ela; a seção onde está o cursor fica destacada. Abaixo, **Versículos · N**: as referências na ordem em que aparecem, sem repetir.

### Salvamento

Salva sozinho 1,5 s depois da última alteração e ao sair da tela. Indicador "Salvando…" / "Salvo" / "Não foi possível salvar. Tentar de novo". O corpo é montado campo a campo (`title`, `document`, `baseRevision`); o servidor responde 409 se `baseRevision` não é a revisão atual, e a tela avisa que a palavra foi alterada em outra aba e oferece recarregar.

## Tempo de fala

Um esboço não é um manuscrito: "A lanterna na trilha" é uma linha e são dois minutos de fala. Contar só palavras erraria por muito. A regra proposta soma duas coisas:

```
segundos = palavras faladas ÷ 130 × 60  +  folga dos blocos
```

- **Palavras faladas:** parágrafos, listas, títulos, Pontos, Ilustração, Aplicação e o texto dos Versículos (são lidos em voz alta). **"Só para mim" não conta.**
- **Ritmo:** 130 palavras por minuto, pregação em português com pausas.
- **Folga por bloco**, pelo que o pregador desenvolve de improviso: Ponto 60 s, Ilustração 90 s, Aplicação 60 s.

Cada seção da estrutura mostra o seu total, arredondado para o minuto (mínimo 1); a barra de cima mostra a soma ("28 min de fala"). Os números ficam numa constante (`SPEECH_PACE`), num lugar só.

**Precisa de calibração.** Antes de fechar a etapa 1, comparar a conta com um ou dois sermões reais do pastor e ajustar ritmo e folgas. Se a regra geral não servir, o passo seguinte (fora da etapa 1) é deixar o pregador fixar os minutos de uma seção à mão, clicando no número.

No roteiro, o momento Palavra mostra a estimativa ao lado da duração planejada ("40 min · palavra estimada em 28"). A duração do momento não muda sozinha.

## Bíblia

### De onde vem o texto

| Opção | Texto | Situação |
|---|---|---|
| **A. Bíblia Livre (BLIVRE)**: recomendada | Baseada na Almeida de 1819 (Textus Receptus), com português atualizado | **CC BY 4.0** (conferido em https://ebible.org/porbr2018/copyright.htm em 19/11/2026). Pode ser usada e redistribuída com o crédito. Arquivos em USFM, USFX e VPL em https://ebible.org/details.php?id=porbr2018 |
| B. Almeida antiga em domínio público (edições de 1819 a 1911) | A linguagem que a igreja reconhece como "Almeida" | Livre, mas a ortografia é a da época e as cópias digitais que circulam têm origem mal documentada |
| C. NVI, ARA, NAA | As que a igreja provavelmente lê no culto | Têm dono (Biblica; Sociedade Bíblica do Brasil). Só com licença por escrito ou por uma API contratada |
| D. Repositórios prontos em JSON (GitHub) | Várias traduções num arquivo só | **Não usar**: costumam incluir NVI e ACF sem licença, e o repositório do ChurchManager é público |

**Recomendação: A.** É a única das quatro com licença clara, texto legível hoje e arquivo de fonte confiável. O seletor de tradução mostra "Bíblia Livre"; a tela de inserir versículo traz o crédito no rodapé ("Bíblia Livre · CC BY 4.0").

### Como entra no sistema

- **Formato:** VPL (um versículo por linha: livro, capítulo, versículo, texto), do pacote `porbr2018_vpl.zip` do eBible.org. É o formato mais simples de ler sem dependência nova.
- **Script:** `npm run script:import-bible -- --file <caminho> --code BLIVRE`, no padrão dos `script:*` que já existem em `apps/api/package.json`. Lê o VPL, mapeia as siglas dos livros para 1 a 66, grava `bible_translations` e `bible_verses` numa transação. Rodar de novo substitui a tradução inteira. Confere que entraram os 66 livros e a contagem de capítulos esperada, e falha se não bater.
- **O arquivo não vai para o Git.** O script recebe o caminho; o `README` do módulo diz de onde baixar e traz o SHA-256 da edição conferida. Roda uma vez por ambiente (local, QA, produção). Sem tradução importada, "Inserir versículo" abre direto no modo de digitar à mão.
- **Crédito:** a licença pede copyright, fonte e data da versão; ficam em `bible_translations` e aparecem na tela e no rodapé do PDF exportado.

### Troca de tradução, já prevista

- Tradução é linha de tabela: importar outra é rodar o script com outro arquivo e outro código. O seletor lista o que existir; `isDefault` diz qual vem marcada.
- O acesso passa por uma interface (`BibleSource`: `lookup(translation, book, chapter, start, end)` e `search(translation, text)`). Hoje há uma implementação, a do banco. Uma tradução licenciada que só possa ser lida por API entra como outra implementação, sem mudar rotas nem telas.
- Para a igreja usar NVI, ARA ou NAA de dentro do sistema é preciso contrato com o dono. Até lá, o pregador digita ou cola o texto no bloco.

### Busca

`parseReference(text)`, função pura com a tabela dos 66 livros (nome, abreviações comuns em pt-BR, com e sem acento, com "1", "I" ou "1ª"):

- `mt 5 14`, `mt 5:14`, `mateus 5.14`, `1co 13 4-7`, `sl 23` (capítulo inteiro) → referência.
- Achou referência: a lista traz o versículo, o intervalo sugerido quando os seguintes existem ("Mateus 5:14-16 · três versículos, do 14 ao 16") e o versículo seguinte. Intervalo só dentro de um capítulo; limite de 200 versículos.
- Não é referência: busca por trecho em `searchText` (todas as palavras digitadas, em qualquer ordem), até 20 resultados, na ordem dos livros.
- Enter insere o primeiro; setas escolhem. O bloco inserido fica com a tradução marcada no seletor.

## Slides

### O que é IA e o que não é

Sendo direto, como na especificação de Cultos:

| Função | Precisa de modelo de linguagem? |
|---|---|
| Estrutura, versículos usados, tempo de fala | **Não.** Sai dos blocos do documento |
| "Só versículos" | **Não.** Os blocos Versículo, na ordem |
| "Versículos e pontos" | **Não.** O título, os Pontos e os Versículos, na ordem |
| A sequência "Tirado do esboço" da conferência | **Não.** Como os blocos têm tipo, tirar a sequência é percorrer o documento. Só precisaria de modelo se o pregador colasse um texto corrido sem blocos; isso não está no desenho e fica de fora |
| **"Slides completos"** | **Sim.** Resumir a Abertura, cada Ponto, cada Ilustração, cada Aplicação e a Conclusão numa frase de telão é trabalho de modelo |

Então há **uma** chamada de modelo no módulo inteiro, e ela pode entrar depois sem mudar o resto.

**Pergunta ao usuário, antes de qualquer implementação de IA:**

1. **Qual provedor?** (Anthropic, OpenAI, Google ou outro.) Nada é assumido.
2. **De quem é a chave?** Uma chave da plataforma, paga pelo ChurchManager para todas as igrejas, ou uma chave por igreja, informada nas configurações.
3. Ciente de que o texto do sermão (sem as anotações "Só para mim") sai do servidor para o provedor a cada geração?

O que já fica definido, qualquer que seja a resposta:

- A chamada fica atrás de uma interface no servidor (`SermonSummarizer.summarize(sections) → frases`). Trocar de provedor é trocar a implementação.
- A chave fica em variável de ambiente na VPS, nunca no Git (o repositório é público) e nunca vai ao navegador.
- Entrada: o texto de cada seção, sem blocos `privateNote`. Saída: uma frase de até 90 caracteres por parte, em formato estruturado. O resultado vira itens **editáveis** na conferência; o pregador sempre revisa antes de enviar.
- O custo é de um texto curto por geração; o valor exato depende do provedor escolhido e é conferido na tabela dele antes de ligar.
- Limite de gerações por usuário por hora, para a chave não ser gasta por engano.
- **Sem chave configurada**, "Slides completos" aparece desligado com "em breve", e a contagem dele não aparece. Nenhum texto da interface diz "IA" enquanto não houver modelo.

### A sequência

`slides` é uma lista ordenada:

```ts
type SlideItem = {
  id: string;
  kind: 'TITLE' | 'VERSE' | 'POINT' | 'SUMMARY' | 'PRIVATE';
  sourceBlockId: string | null; // o bloco de onde saiu (no resumo de uma seção, o Ponto ou Título que a abre); nulo no TITLE e no resumo da Abertura
  text: string;                 // o que vai ao telão
  reference: string | null;     // só no VERSE
  included: boolean;
};
```

Regras de geração (`buildSlides(title, document, mode)`, função pura no servidor):

- **TITLE:** o título da palavra. Entra em "Versículos e pontos" e "Slides completos".
- **VERSE:** um bloco Versículo vira um ou mais itens. Cada versículo é um slide; versículo com mais de 220 caracteres é dividido em frases. A referência do item diz o versículo ("Mateus 5:14").
- **POINT:** o texto do Ponto, sem o número ("A luz chama"), como no desenho.
- **SUMMARY** (só "Slides completos"): a frase do modelo para Abertura, Ilustração, Aplicação e Conclusão.
- **PRIVATE:** cada bloco "Só para mim" entra no fim da lista com `included: false`, com a etiqueta "Só você". Serve para o pregador ver que aquilo ficou de fora.

A contagem de cada opção no modal ("3 slides", "7 slides") vem da mesma função, calculada no painel antes de gerar.

**Decisão do usuário: o item "Só você" pode ser marcado?** O pedido diz as duas coisas: "nunca vai para o telão" e "aparecendo desmarcada".

- **Recomendado: travado.** Aparece desmarcado, com cadeado, e a caixa não marca. Para pôr aquilo no telão, o pregador troca o tipo do bloco no esboço. O servidor descarta `PRIVATE` do envio em qualquer caso. A regra de privacidade fica sem exceção.
- Alternativa: a caixa marca, e ao marcar o item deixa de ser privado naquela sequência. Mais flexível, mas um clique errado põe uma anotação pessoal no telão.

### Conferência (`PalavraEnviar`)

- Lista à esquerda: alça para reordenar (`@dnd-kit`, já instalado), caixa para tirar, tipo, texto. O texto de `POINT` e `SUMMARY` pode ser editado ali; o de `VERSE` não (muda-se no esboço).
- À direita, "No telão": a prévia dos itens marcados, no visual escolhido, com "trocar".
- Cada mudança salva a lista inteira (`PUT /slides`).
- **Quando o esboço muda depois:** se `slidesRevision` é diferente de `revision`, a conferência mostra "O esboço mudou depois destes slides" com **Atualizar**. Atualizar gera de novo e preserva, por `sourceBlockId`, o que o pregador tirou, a ordem que ele deu e o texto que ele editou; bloco novo entra na posição do documento; bloco apagado sai. Nada é atualizado sozinho.

### Visual

- **Minimalista:** fundo preto, texto branco, referência em cinza abaixo.
- **Com fundo:** o mesmo desenho sobre um fundo azul fixo do sistema. Enviar uma imagem de fundo da igreja fica para depois.

O visual é uma chave (`MINIMAL`, `BACKGROUND`). O painel desenha a prévia; a Ponte decide como desenhar no telão.

## Envio para um culto

### Tela (`PalavraCulto`)

Lista dos próximos cultos (de hoje em diante, até 8), cada um com data, hora, nome e, quando for o caso, "já tem uma palavra". Abaixo, **Outra data** com dia e hora. Ao informar uma data, a tela diz o que vai acontecer: "Entra no culto de domingo, 06/12 · 19h" ou "Ainda não há culto nesse dia. A palavra fica guardada e entra sozinha quando ele for criado."

### Regras

1. **Uma palavra, um envio.** Enviar de novo move o envio para a nova data. Para pregar a mesma palavra em dois cultos, o pregador duplica a palavra.
2. **Culto escolhido da lista** → envio com `serviceId`, `pinned: true`, e `date`/`startTime` copiados do culto.
3. **Outra data** → envio com `date`, `startTime`, `pinned: false`, e o casamento roda na hora.
4. **Culto que já tem palavra** (de qualquer autor): a API responde 409 `SERVICE_HAS_SERMON`; a tela pergunta "Este culto já tem uma palavra. Trocar?"; confirmando, reenvia com `replace: true`. O envio anterior é apagado e a palavra dele volta a Rascunho. Qualquer pessoa com `SERMONS: EDIT` pode trocar; avisar o outro pregador não está nesta entrega.
5. **Cancelar o envio:** a palavra volta a Rascunho e sai do roteiro.
7. **O que já passou não muda.** Palavra pregada não pode ter o envio cancelado nem ser reenviada (para pregar de novo, duplica); culto que já aconteceu não é destino; e o envio de um culto passado nunca é trocado. A lista de cultos para enviar só traz os que ainda não começaram.
6. **Apagar uma palavra:** enviada e ainda não pregada, a tela avisa que ela sai do culto, e o envio é apagado junto. Já pregada, o envio fica (com `sermonId` nulo) como registro no roteiro.

### Casamento por data e hora

Uma função pura, `matchDeliveries(services, deliveries)`, recebe os cultos e os envios de **um tenant numa data** e devolve quem fica com quem:

1. Envios `pinned` ficam onde estão; o culto deles está ocupado.
2. Os demais, do mais antigo para o mais novo (`createdAt`, que é carimbado de novo a cada envio: quem reenvia vai para o fim da fila daquela data e nunca passa na frente de quem já esperava): o candidato é o culto daquela data com a hora **mais próxima** da hora pedida (empate: o mais cedo). Se o candidato está livre, casa. Se está ocupado, o envio fica guardado; não pula para outro culto.

A função roda, para a data afetada, numa transação junto com a escrita que a provocou:

- ao enviar para "Outra data";
- **ao criar um culto**: é o caso "enviada antes de o culto existir";
- ao mudar a data ou a hora de um culto (roda na data antiga e na nova);
- ao apagar um culto (o `SetNull` solta o envio; se era `pinned`, deixa de ser, e ele volta a concorrer pela data).

Casos que a regra cobre:

- **Só um culto no dia:** fica com a palavra, qualquer que seja a hora pedida.
- **Dois cultos no dia** (9h e 19h), palavra pedida para 19h: vai para o das 19h. Se o das 9h foi criado primeiro e pegou a palavra, ao criar o das 19h a função roda de novo e a palavra muda para o das 19h, porque o envio não é `pinned`.
- **Culto muda de data:** o envio `pinned` acompanha o culto (a data e a hora dele são atualizadas). O não `pinned` fica na data pedida e volta a guardado.
- **Duas palavras guardadas para o mesmo culto:** a enviada primeiro entra; a outra continua guardada e o autor vê "o culto de 06/12 já tem outra palavra". Trocar exige confirmação, então nada é trocado sozinho.

### Ligação com o módulo Cultos

- `WorshipModule` importa `SermonsModule`, que exporta `SermonDeliveryService`. O `WorshipServicesService` chama `rematch(tenantId, date, tx)` ao criar, mudar e apagar um culto. `SermonsModule` não importa `WorshipModule`: lê os cultos pelo Prisma. A dependência tem uma direção só.
- `GET /worship/services/:id` ganha `sermon: { title, preacherName, slideCount, estimatedMinutes } | null`, lido de `sermon_deliveries`.
- **No roteiro**, o momento `SERMON` mostra a etiqueta com o título, como no desenho. Clicar abre a prévia dos slides, só leitura. Se quem clica é o autor, a prévia traz "Abrir a palavra". Culto com palavra e sem momento `SERMON` mostra um aviso com "Adicionar o momento Palavra".
- A lista de cultos (`GET /worship/services`) ganha `hasSermon`.

## API

Módulo `apps/api/src/modules/sermons`. Rotas em `admin/tenants/me/sermons`, com `AuthGuard('jwt')` + `PermissionsGuard`; leitura pede `SERMONS:VIEW`, escrita `SERMONS:EDIT`. Tenant e autor sempre do JWT.

| Rota | O que faz | Etapa |
|---|---|---|
| `GET /?q=&status=` | As palavras do autor: `id, title, baseReference, pointCount, estimatedSeconds, status, delivery { date, startTime, serviceId, serviceName }, updatedAt` + `counts { all, draft, sent, preached }`. `q` procura em `title` e `verseRefs`, sem acento | 1 |
| `POST /` | `{ title? }`. Cria um Rascunho | 1 |
| `GET /:id` | A palavra inteira: `document`, `revision`, `slides`, envio, `slidesStale` | 1 |
| `PUT /:id` | `{ title?, document?, baseRevision? }`. 409 se a revisão não confere | 1 |
| `POST /:id/duplicate` | Copia título e documento num Rascunho novo, sem slides nem envio | 1 |
| `DELETE /:id` | Apaga (regra 6 do envio) | 1 |
| `GET /service-options` | Próximos cultos: `id, date, startTime, name, hasSermon, isMine` | 1 |
| `GET /delivery-preview?date=&startTime=` | Diz com que culto aquela data casaria, ou que fica guardada | 1 |
| `PUT /:id/delivery` | `{ serviceId }` ou `{ date, startTime }`, e `replace?`. 409 `SERVICE_HAS_SERMON` | 1 |
| `DELETE /:id/delivery` | Cancela o envio | 1 |
| `GET /bible/translations` | Traduções importadas, com o crédito | 2 |
| `GET /bible/search?q=&translation=` | Referência ou trecho | 2 |
| `POST /:id/slides/generate` | `{ mode, style }`. Tira a sequência. `FULL` responde 400 enquanto não houver modelo | 3 (`FULL`: 5) |
| `PUT /:id/slides` | `{ style?, items: [{ id, included, text? }] }`: a lista inteira, na ordem. `text` só vale para `POINT` e `SUMMARY`; item `PRIVATE` nunca fica `included` | 3 |

No módulo Cultos, com `WORSHIP:VIEW`:

| Rota | O que faz | Etapa |
|---|---|---|
| `GET /worship/services/:id` | ganha o resumo `sermon` | 1 |
| `GET /worship/services/:id/sermon` | `title, preacherName, slideStyle, slides` da cópia do envio. 404 se o culto não tem palavra | 3 |

As rotas de nome fixo (`service-options`, `delivery-preview`, `bible/*`) são declaradas antes de `/:id`, que usa `ParseUUIDPipe`.

DTOs com whitelist; nenhum aceita o que o servidor devolve ou calcula (`authorId`, `tenantId`, `status`, `revision`, `baseReference`, `estimatedSeconds`, `kind` de slide, `pinned`).

## Telas (painel)

Pasta `apps/admin/src/features/sermons`. Rotas atrás de `PermissionRoute module="SERMONS"`; ações de escrita somem sem `EDIT`.

- **Menu:** item **Palavras** logo depois de **Cultos**, ícone de livro (`BookOpen`), `modules: ["SERMONS"]`.
- **`/palavras`** (`PalavraLista`): busca "Título ou versículo"; filtro Todas / Rascunhos / Enviadas / Pregadas; "Nova palavra" cria e abre o editor. Cada linha: título, "João 8:12 · 3 pontos" (ou "sem pontos ainda"), situação. Lista vazia: "Você ainda não escreveu nenhuma palavra" com o mesmo botão.
- **`/palavras/:id`** (`Palavra`): o editor, fora do layout com menu (como o editor de música). Barra de cima, barra de ferramentas, estrutura à esquerda, folha no centro. Em tela estreita a estrutura vira um botão que abre uma gaveta. O menu "…" ao lado do título tem Duplicar e Apagar.
- **Inserir versículo** (`PalavraVersiculo`): diálogo com o campo de busca, resultados, seletor de tradução e "Digitar à mão".
- **Gerar slides** (`PalavraSlides`): o que mostrar, com a contagem; o visual; "Montar".
- **`/palavras/:id/slides`** (`PalavraEnviar`): a conferência, dentro do layout com menu, como no desenho. "Enviar para um culto" no topo.
- **Enviar para um culto** (`PalavraCulto`): diálogo. Depois de enviar, volta para a lista com a situação nova.
- **Exportar** (`PalavraExportar`): diálogo com as três opções e a caixa das anotações.
- **No roteiro** (`Roteiro`): a etiqueta da palavra no momento `SERMON`.

Cores e fonte são as do painel (`index.css`). As cores dos blocos (roxo do versículo, verde da ilustração, laranja da aplicação, cinza do "Só para mim") são as do desenho e ficam numa constante do módulo.

## Exportar

Tudo é gerado no navegador, com os dados que o autor já tem na tela. Não há rota nova, e o esboço não passa por nenhum serviço a mais.

| Saída | Como | Alternativa descartada |
|---|---|---|
| **O sermão, em PDF** | Página HTML própria para impressão (A4, fonte serifada, blocos com as cores do desenho), aberta com o `printHtml` que os relatórios de eventos já usam; o pregador escolhe "Salvar como PDF". Todo texto passa pelo `escapeHtml` | Gerar o arquivo com biblioteca (`@react-pdf/renderer`, `pdfkit`): baixa direto, mas é dependência nova e a tipografia teria de ser refeita. Fica para depois se a janela de impressão incomodar |
| **Os slides, em apresentação** | `pptxgenjs` (MIT), carregado só quando o pregador pede (`import()` dinâmico). Um slide 16:9 por item marcado, no visual escolhido; a referência do versículo abaixo do texto | Gerar no servidor: mesmo resultado, com mais uma rota por onde o conteúdo passaria |
| **Só os versículos, em texto** | Um `.txt` montado na hora: referência e texto, na ordem, com o crédito da tradução no fim | |

**"Incluir as anotações Só para mim"** (desmarcada por padrão) vale só para o PDF do sermão. A apresentação e o texto dos versículos nunca levam anotação privada.

Fica para depois: baixar o PDF como arquivo sem passar pela impressão; Word; imagem de fundo e tema da igreja na apresentação; texto formatado para o Holyrics; exportar a biblioteca inteira.

## Contrato para a Ponte (só o formato, nada implementado)

A rota pública do culto para a Ponte é da etapa 2 de Cultos. Quando existir, o culto leva a palavra neste formato, tirado da cópia do envio:

```jsonc
"sermon": {
  "title": "Luz que não se apaga",
  "preacherName": "…",
  "style": "MINIMAL",
  "updatedAt": "2026-11-21T14:32:00Z",
  "slides": [
    { "index": 0, "kind": "TITLE", "text": "Luz que não se apaga", "reference": null },
    { "index": 1, "kind": "VERSE", "text": "Eu sou a luz do mundo; quem me segue não andará em trevas.", "reference": "João 8:12" },
    { "index": 2, "kind": "POINT", "text": "A luz chama", "reference": null }
  ]
}
```

`null` quando o culto não tem palavra. Não há tempo por slide: quem avança é o pregador ou o operador. `kind` nunca é `PRIVATE`. A sessão da Ponte decide como desenhar e como o celular do pregador comanda; uma nota com este formato fica na pasta de notas das sessões.

## Testes

- **API** (`node:test`): validador do documento (aceita o exemplo; recusa nó, atributo e marca desconhecidos e os limites); derivação (seções, versículos, `baseReference`, tempo de fala, "Só para mim" fora da conta); **isolamento por autor** (outro usuário do mesmo tenant, inclusive `TENANT_ADMIN`, recebe 404 e nada é escrito) e por tenant; contrato dos DTOs (recusa `authorId`, `status`, `revision`); `matchDeliveries` (um culto; dois no dia; empate; ocupado; `pinned`; criar culto depois; mudar a data; apagar o culto); troca com `replace`; a cópia do envio nunca leva `PRIVATE`, nem quando o corpo marca; as rotas de Cultos não devolvem nenhum campo do documento; `parseReference` (abreviações, livros numerados, intervalo, capítulo inteiro, texto que não é referência); importação da Bíblia com um VPL pequeno de teste; `buildSlides` nos dois modos sem IA e a preservação dos ajustes ao atualizar.
- **Painel** (vitest): a mesma derivação com o mesmo documento de exemplo da API; lista e filtros; comandos dos cinco blocos no editor; diálogo de versículo (referência, trecho, à mão); diálogo de envio (culto da lista, outra data, "já tem palavra"); conferência (tirar, reordenar, item privado travado); rota protegida por `SERMONS`; conteúdo do `.txt` e do HTML de impressão, com e sem anotações privadas.
- Gates do `AGENTS.md` com exit 0 e o fluxo conferido no navegador, em cada etapa.

## Etapas

Cada etapa é uma entrega que funciona sozinha, com o seu próprio plano de implementação, e entra pela `qa`.

1. **Biblioteca, editor e envio (sem IA, sem Bíblia, sem slides).** Permissão `SERMONS` e grupo Pregadores; menu; lista com busca e filtros; editor Tiptap com os cinco blocos, estrutura, tempo de fala e salvamento automático; Versículo **digitado à mão**; enviar para um culto ou outra data, com o casamento, a troca e o `SERMON` no roteiro (o roteiro mostra o título). No lugar de "Gerar slides", a barra de cima tem "Enviar para um culto". **Depende de Cultos estar na `qa`.**
2. **Bíblia.** Tabelas, script de importação, `parseReference`, busca por trecho, o diálogo de inserir versículo completo. **Depende da decisão 1.**
3. **Slides sem IA.** "Só versículos" e "Versículos e pontos", os dois visuais, a conferência, a cópia no envio, a prévia no roteiro. "Gerar slides" volta para a barra de cima e "Enviar para um culto" vai para a conferência, como no desenho.
4. **Exportar.** PDF, apresentação e texto. **Depende da decisão 3.**
5. **Slides completos.** A chamada de modelo. **Depende da decisão 2** (provedor e chave).
6. **Na Ponte** (outra sessão): a palavra na rota pública do culto e o avanço pelo celular.

As etapas 2, 3 e 4 não dependem uma da outra, a não ser que a apresentação exportada (4) precisa dos slides (3).

## Fora desta entrega

- Avançar os slides no culto (Ponte).
- Organizar em blocos um texto corrido colado ou importar um arquivo do Word.
- Fixar à mão os minutos de uma seção.
- Avisar o pregador quando a palavra dele é trocada num culto ou quando o culto dela é criado.
- Compartilhar uma palavra com outro pregador; séries de sermões; histórico de versões.
- Traduções com dono (NVI, ARA, NAA) e imagem de fundo da igreja nos slides.
- Uma palavra em mais de um culto ao mesmo tempo; mais de uma palavra por culto.
