# Cultos: Músicas e Roteiro (etapa 1)

Data: 19/11/2026 · Branch: `claude/cultos-musicas-roteiro-332cc9` (entra pela `qa`).
Telas aprovadas: https://claude.ai/artifact/QU7o3ybrFftbDyX6hugHLu (15 quadros; letras e nomes inventados).

## Problema

A equipe de louvor monta cada música à mão em vários lugares: a letra no Holyrics, o tempo de cabeça, a luz na mesa. A Ponte do Culto (`apps/ponte`) já tem um protótipo que executa letra e luz seguindo o áudio (`pc/louvor.html`, rotas `/api/louvor/*`), mas a música mora num `config.yaml` e num `_marcas_louvor.json` dentro do PC da igreja.

Esta etapa cria, no ChurchManager, o lugar onde a música é montada (letra em partes, tempo de cada slide, clima de luz por parte) e onde o culto é roteirizado. A Ponte passa a ler daqui na etapa 2.

## Decisões já tomadas (não reabrir)

- Grupo de menu **Cultos** com **Músicas** e **Roteiro**, e permissão própria.
- **O relógio é o áudio**, nunca BPM x compasso. BPM, tom e compasso são só ficha técnica.
- Criar música: letra (obrigatória) e áudio (opcional) → tela de carregamento → editor em 4 passos (Letra, Áudio e tempo, Climas, Prévia).
- Cinco climas fixos; a plataforma guarda só a chave, o significado em luz fica na Ponte.
- Situações: Pronta, Falta o tempo, Rascunho. Só Pronta passa sozinha no culto.
- Fora desta etapa: qualquer mudança em `apps/ponte` e nos PCs; alinhamento automático de voz.

## O que é IA e o que não é (para decidir)

Sendo direto sobre o que roda nesta entrega:

| Passo da tela de carregamento (desenho) | Nesta entrega |
|---|---|
| Lendo a letra | Roda (regra) |
| Separando versos e refrão | Roda (regra) |
| Montando os slides | Roda (regra, o formatador da Ponte) |
| Ouvindo o áudio | **Não roda.** Vira "Enviando o áudio" (o envio real do arquivo) |
| Encaixando a letra no tempo | **Não roda e não aparece.** Exige alinhamento de voz no servidor |
| Sugerindo o clima de cada parte | Roda (regra por tipo de parte) |

**Proposta: esta entrega não usa modelo de linguagem.** A organização é por regra, no servidor, atrás de uma função única (`organizeLyrics`). Trocar por um modelo depois é mexer nessa função; a rota, o formato e as telas não mudam. Consequências:

- Não precisa de chave nem de provedor agora; nada de segredo novo.
- Os textos da interface dizem **"Organizada automaticamente"** e **"Sugestão automática"** em vez de "pela IA", porque não é IA. Voltam a dizer "IA" quando houver um modelo.
- A tela de carregamento mostra só os passos da coluna "Roda", sem "Cerca de 1 minuto" (a regra leva menos de um segundo; o que demora é o envio do áudio).
- No passo 2, a sugestão automática de tempo aparece como controle desligado ("Sugerir os tempos · em breve"). O estado "IA" dos slides existe no dado (`timeSource`), mas nada o produz ainda.

Regras da organização:

1. **Slides:** porte fiel do formatador de `apps/ponte/pc/letras.html` (`splitPhrase` com o mesmo custo, 28 caracteres por linha, 2 linhas por slide em geral e 3 no máximo, `(2x)` repete, `//` é recado). O arquivo da Ponte não é tocado; o porte vive na API com teste que confere a mesma saída do exemplo do `letras.html`.
2. **Partes:** cada estrofe (bloco separado por linha em branco) é uma parte. Cabeçalho escrito pela banda (`Refrão`, `[Ponte]`, `Verso 2:`, `Intro`, `Pré-refrão`, `Instrumental`, `Final`) define o tipo e some do texto. Sem cabeçalho: estrofe cujo texto se repete na música é **Refrão**; as outras são **Verso**.
3. **Instruções:** linha com `//` vira instrução. O destinatário sai do começo do texto (`Todos`, `Solo`/`Voz`/`Vocal`, `Teclado`, `Violão`, `Guitarra`, `Baixo`, `Bateria`); sem nome reconhecido, vai para Todos.
4. **Clima sugerido:** Intro → Contemplativo; Verso → Adoração; Pré-refrão e Ponte → Crescendo; Refrão → Celebração; último Refrão, quando há mais de um → Explosão; Instrumental → Adoração; Final → Contemplativo.

## Modelo de dados

Prisma, tabelas com prefixo `worship_`. Músicas, modelos e cultos têm `tenantId` (`onDelete: Cascade` a partir do tenant); momentos e músicas do roteiro pertencem ao culto e são sempre lidos através dele.

### Música: uma linha, com a letra montada num documento JSON

A letra é editada como um documento e salva inteira a cada mudança (dividir um slide renumera os seguintes; marcar um trecho como Refrão divide uma parte em duas). Por isso partes, slides, instruções e tempos **não** viram tabelas: ficam num campo JSON validado campo a campo pelo DTO. O que precisa de filtro e contagem (título, situação, duração) fica em colunas.

`WorshipSong` (`worship_songs`):

| Campo | Tipo | Nota |
|---|---|---|
| `id`, `tenantId`, `createdAt`, `updatedAt` | | |
| `title` | VarChar(255) | |
| `artist` | VarChar(255)? | ficha |
| `musicalKey` | VarChar(16)? | tom, ficha |
| `bpm` | Int? | ficha (30–300) |
| `timeSignature` | VarChar(8)? | compasso, ficha (ex.: `4/4`) |
| `rawLyrics` | Text | a letra como foi colada; serve ao "Organizar de novo" |
| `rows` | Json | o documento (abaixo); `[]` enquanto não organizada |
| `status` | enum `WorshipSongStatus` | `DRAFT`, `NEEDS_TIMING`, `READY`; calculado pelo servidor |
| `audioUrl` | VarChar(512)? | áudio-guia |
| `audioFileName` | VarChar(255)? | nome original, só para mostrar |
| `audioDurationSeconds` | Float? | lida pelo navegador ao enviar |
| `audioSizeBytes` | Int? | |
| `readyAt` | DateTime? | quando foi marcada "Pronta para o culto" |

Índices: `(tenantId, status)`, `(tenantId, title)`.

**O documento (`rows`)** é uma lista plana de linhas, na ordem em que aparecem na tela:

```ts
type Row =
  | { id: string; type: 'lyric'; text: string } & RowMeta   // uma linha de letra, como digitada
  | { id: string; type: 'cue'; target: CueTarget; text: string } & RowMeta  // instrução para um músico
  | { id: string; type: 'break' }                           // linha em branco: separa slides

type RowMeta = {
  part?: { kind: PartKind; mood: Mood | null }; // esta linha abre uma parte
  time?: number | null;        // segundo do áudio em que o SLIDE que começa aqui entra
  timeSource?: 'MANUAL' | 'AI'; // quem pôs o tempo (AI ainda não existe)
};

type PartKind = 'INTRO' | 'VERSE' | 'PRE_CHORUS' | 'CHORUS' | 'BRIDGE' | 'INSTRUMENTAL' | 'ENDING';
type Mood = 'CONTEMPLATIVE' | 'WORSHIP' | 'BUILD' | 'CELEBRATION' | 'EXPLOSION';
type CueTarget = 'ALL' | 'VOCAL' | 'KEYS' | 'ACOUSTIC_GUITAR' | 'ELECTRIC_GUITAR' | 'BASS' | 'DRUMS';
```

Tudo o mais é derivado, por uma função pura que existe igual na API e no painel:

- **Parte:** começa na linha com `part` e vai até a próxima. A primeira linha do documento sempre abre parte. Nome: "Verso 1", "Verso 2"… (versos numerados); os demais sem número.
- **Slide:** sequência de linhas `lyric`/`cue` sem `break` no meio e sem mudar de parte. Suas linhas de telão são as `lyric`, em maiúsculas; suas instruções são as `cue`. Slide só com instrução é válido (Intro, Instrumental): telão vazio, retorno com o recado.
- **Tempo do slide:** o `time` da primeira linha do slide. `time` em linha que não abre slide é ignorado e limpo ao salvar.
- **Repete:** não é marcação; as linhas são duplicadas de fato. Um refrão que volta é outro slide, com outro tempo, porque o relógio é o áudio.

Limites validados: até 600 linhas; `text` até 200 caracteres; `id` até 36; `time` entre 0 e 3600.

**Situação**, recalculada pelo servidor a cada escrita:

- `DRAFT` (Rascunho): não tem nenhum slide.
- `READY` (Pronta): foi marcada como pronta e continua completa (tem áudio, todo slide tem tempo em ordem crescente, toda parte tem clima). Uma edição que quebre isso derruba para `NEEDS_TIMING` e limpa `readyAt`.
- `NEEDS_TIMING` (Falta o tempo): o resto. A resposta traz `pending: ('AUDIO' | 'TIMES' | 'MOODS' | 'CONFIRM')[]` para a tela dizer o que falta; quando só falta confirmar, a lista mostra "Falta conferir" em vez de "Falta o tempo".

### Roteiro

`WorshipServiceTemplate` (`worship_service_templates`): `name` VarChar(120), `startTime` VarChar(5) (`HH:MM`), `moments` Json (`[{ name, kind, durationMinutes }]`). Sem nenhum modelo salvo, a API oferece o **Culto padrão** embutido no código: Pré-culto 15 (antes do início), Abertura 5, Louvor 17, Avisos 5, Ofertório 5, Palavra 40, Encerramento 5, início 19:00.

`WorshipService` (`worship_services`): `date` Date, `startTime` VarChar(5), `name` VarChar(120) (vem do modelo; editável), `templateId` (opcional, `SetNull`). Índice `(tenantId, date)`.

`WorshipServiceMoment` (`worship_service_moments`): `serviceId` (Cascade), `name` VarChar(120), `kind` enum `WorshipMomentKind` (`PRE_SERVICE`, `GENERIC`, `WORSHIP`), `durationMinutes` Int (1–600), `sortOrder`.

`WorshipServiceSong` (`worship_service_songs`): `serviceId` (Cascade), `songId` (`Restrict`), `sortOrder`. A mesma música pode entrar duas vezes.

Horários calculados na leitura: momentos `PRE_SERVICE` contam para trás a partir de `startTime`; os demais, para a frente. O momento `WORSHIP` dura a soma dos áudios das músicas (arredondada para cima em minutos) quando todas têm áudio; senão, vale o `durationMinutes` dele. As músicas do roteiro pertencem ao culto; a aba Louvor as mostra e o momento Louvor mostra a contagem.

## Permissão

Novo valor `WORSHIP` em `PermissionModule` (migração `ALTER TYPE … ADD VALUE`). `VIEW` vê músicas e roteiros; `EDIT` cria, altera, envia áudio e marca como pronta. Entra em `PERMISSION_MODULES` (API e painel) com rótulo **Cultos** ("Músicas, tempos, climas e roteiro do culto"), em `auth-storage.ts`, e num modelo de grupo novo **Equipe de louvor** (`WORSHIP: EDIT`). Administradores da igreja já têm tudo.

## API

Módulo `apps/api/src/modules/worship`. Todas as rotas em `admin/tenants/me/worship`, com `AuthGuard('jwt')` + `PermissionsGuard`; leitura pede `WORSHIP:VIEW`, escrita `WORSHIP:EDIT`. Tenant sempre do JWT; id de outro tenant responde 404 sem escrever.

Músicas:

| Rota | O que faz |
|---|---|
| `GET /songs?q=&status=` | Lista resumida (`id, title, musicalKey, bpm, audioDurationSeconds, status, pending, slideCount`) + `counts { all, ready, pending }`. `q` procura no título sem diferenciar maiúsculas nem acento (repertório pequeno: o filtro é feito na API, em memória). |
| `POST /songs` | `{ title, rawLyrics?, organize? }`. Com `organize: true`, já devolve as linhas organizadas. Sem letra: Rascunho só com o nome. |
| `GET /songs/:id` | Música inteira, com `rows`, `status`, `pending`. |
| `PUT /songs/:id` | Parcial: `{ title?, artist?, musicalKey?, bpm?, timeSignature?, rows? }`. Salva o documento inteiro quando `rows` vem. |
| `POST /songs/:id/organize` | `{ rawLyrics? }`. Refaz a organização; **apaga** ajustes e tempos (a tela confirma antes). |
| `POST /songs/:id/audio` | multipart: `file` + `durationSeconds`. Troca o áudio (apaga o anterior do R2). Os tempos ficam, mas a música deixa de estar Pronta (volta a "Falta conferir"): eles foram marcados contra outro arquivo. |
| `DELETE /songs/:id/audio` | Remove o áudio. |
| `POST /songs/:id/ready` · `DELETE /songs/:id/ready` | Marca / desmarca "Pronta para o culto". Incompleta → 400 dizendo o que falta. |
| `DELETE /songs/:id` | 409 se a música está em algum roteiro. |

Roteiro:

| Rota | O que faz |
|---|---|
| `GET /service-templates` | Os modelos da igreja. Enquanto não houver nenhum, vem só o Culto padrão embutido (`id: null`). |
| `POST /service-templates` | `{ name, fromServiceId }` salva os momentos de um culto como modelo; `{ name, startTime?, moments }` cria do zero. Mandar os dois, ou nenhum, responde 400. |
| `PUT /service-templates/:id` | Parcial: `{ name?, startTime?, moments? }`. A lista de momentos é trocada inteira. Não altera cultos já criados. |
| `DELETE /service-templates/:id` | |
| `GET /services` | Lista (`id, date, startTime, name, songCount`), do mais novo para o mais antigo. |
| `POST /services` | `{ date, startTime?, templateId? }`: cria o culto com os momentos do modelo. |
| `GET /services/:id` | Culto com `moments` (com `startsAt` calculado), `songs` (resumo de cada música, na ordem) e `endsAt`. |
| `PUT /services/:id` | `{ date?, startTime?, name? }`. |
| `DELETE /services/:id` | |
| `PUT /services/:id/moments` | `{ moments: [{ id?, name, kind, durationMinutes }] }`: a lista inteira, na ordem (acrescentar, tirar, reordenar numa chamada só). |
| `PUT /services/:id/songs` | `{ songIds: string[] }`: a lista inteira, na ordem. Id que não é do tenant → 400. |

DTOs com whitelist; nenhum aceita campo que o servidor devolve (`status`, `pending`, `audioUrl`…).

## Armazenamento do áudio

O `StorageService` de hoje só tem `uploadImage` (5 MB; JPEG, PNG, WebP, GIF pela assinatura dos bytes). Muda:

- A parte comum (conferir configuração, `PutObject`, log sem segredo) sai para um método privado; `uploadImage` continua com a mesma assinatura e o mesmo comportamento.
- Novo `uploadAudio(buffer, folder)`: aceita **MP3, WAV, M4A (AAC em MP4), OGG e FLAC** pela assinatura dos bytes (nunca pelo nome nem pelo mimetype), até **90 MB**, chave `tenants/<id>/worship/audio/<uuid>.<ext>`, e devolve `{ url, sizeBytes }`.
- Novo `AudioUploadInterceptor` (mesmo desenho do `ImageUploadInterceptor`, com o limite de áudio e 413 em pt-BR).

Pontos para saber:

- **90 MB** porque o proxy da Cloudflare corta envio acima de 100 MB. Um WAV de 5 minutos em 44,1 kHz/16 bits tem cerca de 50 MB. A tela recomenda MP3 ou M4A. É preciso conferir o `client_max_body_size` do nginx da VPS antes de ir para produção (não está no repositório).
- O arquivo passa pela memória da API durante o envio, como as imagens.
- **O áudio fica em URL pública com nome sorteado**, igual às imagens: quem tem o link ouve, e o link não é adivinhável. É o que deixa o `<audio>` do painel e a Ponte tocarem sem cabeçalho de autenticação. Se o VS for material licenciado que não pode ficar em link aberto, a alternativa é URL assinada com validade curta; fica anotada, fora desta entrega.
- A duração é lida pelo navegador (`<audio>.duration`) e enviada junto; o servidor não decodifica áudio.

## Telas (painel)

Pasta `apps/admin/src/features/worship`. Rotas atrás de `PermissionRoute module="WORSHIP"`; ações de escrita somem sem `EDIT`.

- **Menu:** item **Cultos** entre Eventos e Igreja, com **Músicas** e **Roteiro** aninhados (`SidebarMenuSub`).
- **`/cultos/musicas`** (quadro 1): busca, filtro Todas / Prontas / Pendentes com contagem, lista com título, ficha ("Sol · 72 bpm · 4:12" ou "Só a letra") e situação.
- **`/cultos/musicas/nova`** (2a, 2b): **Nome da música** (o desenho não tinha; é necessário), Letra, Áudio opcional, "Organizar". A tela de carregamento lista os passos reais.
- **`/cultos/musicas/:id?passo=1..4`**: editor em tela cheia, sem o menu lateral, com a trilha dos 4 passos clicável. Salva sozinho a cada alteração (com indicador "Salvando… / Salvo"). O título abre a ficha (nome, artista, tom, BPM, compasso).
  - **1 Letra** (2, 2c): documento editável de verdade (digitar, apagar, Enter, colar como texto puro). Nome da parte na margem esquerda; instrução como etiqueta âmbar não editável (clicar abre para alterar ou remover). Ao selecionar um trecho, a barrinha flutuante: Verso, Refrão, Ponte, Outra parte (Intro, Pré-refrão, Instrumental, Final), Instrução (destinatário + texto), Repete (duplica o trecho logo abaixo), Dividir slide (o slide passa a começar na linha selecionada; a instrução logo acima de uma linha vai sempre junto com ela). Botão "Parte sem letra" para Intro, Instrumental e Final. "Organizar de novo" com confirmação. À direita: cartão do áudio (enviar / trocar) e a prévia dos slides, com o slide do cursor destacado.
  - **2 Áudio e tempo** (3): tocador com as partes na linha do tempo; cartão do slide atual com "A seguir"; **Marcar aqui** (barra de espaço) grava o tempo do slide selecionado e passa para o próximo (com todos os slides marcados, a barra de espaço passa a tocar e pausar, e só remarca o slide em que se clicou); −0,1 / +0,1 s; voltar 5 s. Lista dos slides com tempo e estado: **Sem tempo**, **Certo**, **Conferir** (tempo fora de ordem ou além do fim do áudio) e **IA** (reservado). "Aprovar" e "Sugerir os tempos" aparecem desligados, com "em breve". Sem áudio, o passo pede o envio.
  - **3 Climas** (4): uma linha por parte com os cinco climas; barra de energia da música; legenda. "Voltar à sugestão" reaplica a regra.
  - **4 Prévia** (5): telão e retorno do altar lado a lado seguindo o áudio (o retorno mostra a instrução e "A seguir"); tocador com parte anterior / próxima; lista de conferência (letra, áudio, tempos, climas, "prévia assistida até o fim" como lembrete que não bloqueia); **Letra para o Holyrics** (slides em maiúsculas separados por linha em branco, instruções como `//`, botão Copiar); **Pronta para o culto**.
- **`/cultos/roteiro`** (6, 6b a 6e): seletor de culto (data e hora) e "Novo culto" (data, hora, modelo). Abas **Culto inteiro** (momentos com horário e duração; acrescentar, renomear, mudar duração, remover, arrastar para reordenar; rodapé "7 momentos · termina às 20:17") e **Louvor** (músicas na ordem, com atalho "Falta o tempo" para o passo 2; arrastar para reordenar; remover). **Adicionar música** abre o modal de busca: achou no repertório, adiciona; não achou, "Criar «nome»" abre letra + áudio opcional com **Organizar** (cria, adiciona ao roteiro e abre o editor) e **Só adicionar ao roteiro** (cria como Rascunho).

- **`/cultos/roteiro/modelos`** (acrescentada em 20/11/2026, botão "Modelos de culto" no Roteiro): lista os modelos com quantidade de momentos, duração total e horário de início. "Novo modelo" e "Editar" abrem o mesmo editor de momentos da aba Culto inteiro, com o tipo de cada momento (Antes do culto, Momento, Louvor, Palavra), salvo de uma vez ao confirmar. Excluir pede confirmação. Editar ou excluir um modelo não muda os cultos já criados a partir dele. O Culto padrão do sistema continua no código e aparece só enquanto a igreja não tem modelo próprio, com "Personalizar" (cria um modelo de verdade a partir dele); assim nunca falta um modelo para criar culto, nenhuma leitura grava no banco, e excluir tudo devolve o padrão em vez de deixar a lista vazia.

Cores e fonte são as do painel (`index.css`). As cores dos cinco climas são as do desenho e ficam numa constante do painel; servem só para a tela.

## Contrato para a Ponte (etapa 2: lado do ChurchManager implementado em 20/11/2026)

A Ponte lê um culto pronto para executar. O lado da Ponte (buscar, guardar, executar) é da frente que cuida de `apps/ponte`; aqui fica o que o ChurchManager entrega.

**Rotas** (só leitura, limite de 30 consultas por minuto por IP):

- `GET /api/public/tenants/:slug/worship/services/next`: o primeiro culto de hoje em diante ("hoje" no fuso `America/Sao_Paulo`). Sem culto: `{ "version": "vazio", "service": null, "sermon": null, "songs": [] }`.
- `GET /api/public/tenants/:slug/worship/services/:id`: um culto específico.

**Autenticação:** cabeçalho `x-ponte-key` com a chave da igreja. Chave ausente, errada, revogada ou de outra igreja responde sempre 401. A chave é gerada em Cultos › Roteiro › **Ponte do Culto** (pede `SETTINGS:EDIT`), aparece uma única vez, e o banco guarda só o SHA-256 (`worship_ponte_keys`, uma por igreja; gerar outra invalida a anterior). A tela mostra o final da chave em uso e a última leitura.

**Formato:**

```jsonc
{
  "version": "332896331eb6",          // impressão digital do conteúdo; só muda quando algo muda
  "service": {
    "id": "…", "date": "2026-11-22", "startTime": "19:00", "name": "Domingo à noite",
    "updatedAt": "2026-11-21T14:32:00Z", "endsAt": "20:17",
    "moments": [{ "name": "Louvor", "kind": "WORSHIP", "startsAt": "19:05", "durationMinutes": 17 }]
  },
  "sermon": { "title": "…", "preacherName": "…", "estimatedMinutes": 35 },   // ou null
  "songs": [{
    "id": "…", "title": "Luz da Manhã", "status": "READY", "updatedAt": "…",
    "musicalKey": "Sol", "bpm": 72, "timeSignature": "4/4",
    "holyricsId": "1741522267781",    // ou null: aí a Ponte procura a música pelo título
    "audio": { "url": "https://…/audio/<uuid>.mp3", "fileName": "luz-da-manha.mp3", "durationSeconds": 252.4, "sizeBytes": 6048211 },
    "parts": [{ "index": 0, "kind": "VERSE", "name": "Verso 1", "mood": "WORSHIP", "time": 14.2, "firstSlide": 0, "slideCount": 2 }],
    "slides": [{
      "index": 0, "part": 0, "time": 14.2,
      "lines": ["ANTES DO SOL NASCER", "TUA VOZ ME CHAMOU"],
      "cues": [{ "target": "VOCAL", "text": "solo, voz masculina" }]
    }],
    "holyricsText": "//Vocal: solo, voz masculina\nANTES DO SOL NASCER\nTUA VOZ ME CHAMOU\n\n…"
  }]
}
```

- `moments[].kind`: `PRE_SERVICE`, `GENERIC`, `WORSHIP` ou `SERMON`. `durationMinutes` já é a duração efetiva (o louvor pela soma dos áudios).
- `time` é o segundo do áudio; corresponde ao `segundo` do `_marcas_louvor.json`. `parts[].time` é o tempo do primeiro slide da parte.
- `mood`: `CONTEMPLATIVE`, `WORSHIP`, `BUILD`, `CELEBRATION`, `EXPLOSION` (na Ponte: contemplativo, adoracao, crescendo, celebracao, explosao). A Ponte decide cena e modo de luz.
- `slides` é a sequência que o telão percorre, em ordem de execução; um refrão que volta aparece de novo, com o seu tempo. `slides[].index` é a posição nessa sequência, **não** o índice do slide no Holyrics. Quando a letra do Holyrics foi colada do `holyricsText`, a ordem dos blocos é a mesma.
- `cues` vão só para o retorno do altar, nunca para o telão.
- `holyricsId` é preenchido à mão na ficha da música (campo "Id da música no Holyrics").
- Música que não está `READY` vem com o que tiver (`time: null` onde falta, `audio: null` sem áudio); a Ponte a trata como manual.
- O áudio muda de URL quando é trocado, então a URL serve de chave de cache para o download.
- `sermon` traz só título, pregador e tempo estimado; os slides da palavra entram quando a etapa 3 de Palavras existir.

## Testes

- **API** (`node:test`): organizador (o exemplo do `letras.html` produz os mesmos slides; refrão por repetição; cabeçalhos; instruções e destinatário; `(2x)`); derivação de partes/slides e cálculo de situação; isolamento por tenant em músicas e cultos (id de outro tenant → 404, nada escrito); contrato dos DTOs (recusa `status`, `audioUrl`, `tenantId`; valida linhas); assinatura dos formatos de áudio e limite de tamanho; horários do roteiro (pré-culto para trás, louvor pela soma dos áudios).
- **Painel** (vitest): operações do documento (definir parte, instrução, repete, dividir, ler o DOM editado de volta em linhas); derivação e texto do Holyrics; lista de músicas; modal de adicionar música (achou / não achou / criar); rota protegida por `WORSHIP`.
- Gates do `AGENTS.md` com exit 0 e o fluxo completo conferido no navegador.

## Fora desta entrega

- Alinhamento automático da letra no áudio, e qualquer modelo de linguagem.
- O lado da Ponte (buscar e executar) e o indicador "Na Ponte · 14:32" do desenho. A rota e a chave já existem (ver "Contrato para a Ponte").
- Áudio no Reaper (etapa 3). Painel do culto ao vivo e tela do pastor (outra sessão).
- Mais de um bloco de louvor por culto; histórico de versões da música; envio direto ao Holyrics (o token da igreja não permite).
