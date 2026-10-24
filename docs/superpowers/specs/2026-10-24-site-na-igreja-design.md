# Site dentro de Igreja — fluxo da página e ordem das seções

Data: 24/10/2026 · Branches: `feat/site-na-igreja` (monorepo, base `qa`) e `feat/site-na-igreja` (igreja-paraiso, base `homologacao`)

## Problema

O painel tem duas entradas para o mesmo assunto: **Site** (cards com os textos das seções) e **Igreja** (filiais, pastores, ministérios, agenda, ofertório e redes). Várias seções do site misturam textos editados em Site com dados que vêm de Igreja, e os cards não mostram isso. A ordem das seções no site está fixa no código do `igreja-paraiso`, e o painel mostra outra ordem (a do registry), que não bate com a página.

## Objetivo

- Igreja passa a ser o único lugar de gestão do conteúdo institucional; Site vira uma aba dela.
- A aba Site mostra a página inicial como uma **linha de fluxo** na ordem real do site, com Topo e Rodapé fixos e o miolo reordenável (arrastar + setas).
- A ordem salva no painel é a ordem renderizada no site público.
- Cada linha deixa claro de onde vem o dado e leva até a aba de origem; seções que puxam dados de outra aba mostram uma prévia discreta, só leitura.
- O painel lateral de edição fica mais enxuto, em pt-BR.

## Fora do escopo

- Ocultar uma seção inteira do site.
- Fazer "Venha nos visitar" aparecer no site.
- Reordenar as "Outras páginas" (Time Pastoral, Venha nos visitar).
- Edição inline das seções no fluxo.

## API (`apps/api`)

### Modelo

Nova tabela `SiteLayout`:

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `tenantId` | uuid, único | FK para `Tenant`, `onDelete: Cascade` |
| `homeOrder` | `String[]` | ids dos blocos reordenáveis |
| `createdAt` / `updatedAt` | timestamp | |

Sem linha → ordem padrão.

### Blocos da página inicial

Definidos no registry (`site-content.registry.ts`) como `SITE_HOME_BLOCKS`, na ordem padrão (a de hoje no site):

`mission`, `schedules`, `celulas`, `events`, `churches`, `giving`, `youtube`

`hero` e `contact` não entram: são fixos no início e no fim.

### Endpoints

Painel (tenant do JWT):

- `GET /admin/tenants/me/site-content/layout` → `{ home: string[], updatedAt: string | null }` — exige `SITE:VIEW`.
- `PUT /admin/tenants/me/site-content/layout` com `{ home: string[] }` → mesmo formato — exige `SITE:EDIT`.

Validação do `PUT`: `home` tem de ser uma permutação exata de `SITE_HOME_BLOCKS` (sem faltar, sem repetir, sem id desconhecido). Caso contrário 400 com mensagem em pt-BR. Campos extra são rejeitados pelo `ValidationPipe` (`forbidNonWhitelisted`).

Salvar dispara `SiteRevalidationService.notifyContentChanged(tenantId)`, como o conteúdo.

Público: `GET /public/tenants/:slug/site-content` passa a devolver também `layout: { home: string[] }`. Acréscimo compatível: quem não lê o campo continua funcionando. Se a ordem guardada estiver desatualizada em relação ao registry (bloco novo ou removido no futuro), a resposta normaliza: remove ids desconhecidos e acrescenta os que faltam na posição padrão.

## Site (`igreja-paraiso`)

- `page.tsx` monta o miolo a partir de um mapa id → componente, seguindo `layout.home`.
- Função pura `resolveHomeOrder(layout)` em `src/lib/site-content/`: sem campo ou campo inválido → ordem atual; ids desconhecidos ignorados; ids conhecidos que faltam entram na posição padrão.
- `Hero` continua primeiro; rodapé continua no `(site)/layout.tsx`. Eventos continua condicional (só com eventos).

## Painel (`apps/admin`)

### Navegação e permissões

- Abas de Igreja ficam na URL: `/igreja?aba=filiais|pastores|ministerios|agenda|ofertorio|site`. Aba inválida ou sem permissão → primeira aba permitida.
- Nova aba **Site**, a última.
- `/site` redireciona para `/igreja?aba=site`. Item "Site" sai da barra lateral.
- Igreja aparece para quem tem `CHURCH:VIEW` ou `SITE:VIEW`; cada aba segue sua permissão (abas de Igreja → `CHURCH`, Site → `SITE`).
- Trocar de aba continua passando pelo aviso de alterações não salvas (Ofertório & Redes e, agora, ordem não salva na aba Site).

### Aba Site

**Página inicial** — linha vertical:

1. **Topo** — travado, sem ação.
2. Miolo reordenável — alça para arrastar (dnd-kit, com sensores de ponteiro e teclado) e botões ↑/↓.
3. **Rodapé · contato** — travado, com "Editar".

A barra "Salvar ordem / Descartar" aparece só quando a ordem difere da salva. Salvar envia exatamente `{ home: [...] }`.

**Outras páginas** — Time Pastoral (`/time-pastoral`) e Venha nos visitar (selo "Não aparece no site").

Cada linha: ícone, nome, resumo de uma linha, selo de origem, ação.

| Bloco | Tipo | Selo | Ação | Prévia (só leitura) |
|---|---|---|---|---|
| Missão / Sobre | próprio | data de atualização | Editar | — |
| Programação | externo | Vem de Agenda Semanal | Ir para Agenda Semanal | horários ativos agrupados por dia |
| Células | próprio | data | Editar | — |
| Eventos | externo | Vem de Eventos | Abrir Eventos | próximos eventos publicados |
| Igrejas & Missões | misto | Usa Filiais | Editar | filiais ativas |
| Ofertório | misto | Usa Ofertório & Redes | Editar | — |
| Transmissões | próprio | data | Editar | — |
| Rodapé · contato | misto | Usa Ofertório & Redes | Editar | — |
| Time Pastoral | misto | Usa Pastores | Editar | pastores ativos |
| Venha nos visitar | próprio | Não aparece no site | Editar | — |

Prévia: texto pequeno e cinza abaixo do resumo, até 3 itens e "+N". Só itens ativos/publicados. Reaproveita as consultas existentes do painel; se a pessoa não tem permissão de ver a origem, a prévia não aparece (selo continua).

### Painel lateral simplificado

- Cabeçalho só com o título.
- Seção mista: linha discreta no topo ("Os dados de PIX vêm de Ofertório & Redes · Abrir"). O link fecha o painel e troca de aba; se houver rascunho, confirma o descarte antes.
- Ajuda dos campos num ícone ⓘ com tooltip, em vez de parágrafo.
- As três partes do título (`titlePart1`, `titleHighlight`, `titlePart2`) numa linha só em telas largas.
- Itens de lista recolhidos (mostram o título; abrem ao clicar), mantendo ↑/↓ e remover.
- Rodapé: "Cancelar" e "Salvar"; "Restaurar original" num menu ⋯ com a confirmação atual.
- Textos em pt-BR: "Salvar", "seção", "Restaurar", datas relativas com `pt-BR`.

## Ordem de deploy

1. API + painel (mesmo PR para `qa`). Migração aditiva; público ganha um campo novo.
2. Site (PR para `homologacao`). Com fallback, funciona com ou sem o campo.

Até o passo 2 estar no ar, reordenar no painel não muda o site — anotar no PR.

## Testes

- API: ordem padrão sem linha; ordem salva no público; 400 para faltando/repetido/desconhecido/campo extra; 403 sem `SITE:EDIT`; isolamento por tenant; revalidação chamada; normalização de ordem desatualizada.
- Painel: aba sincronizada com `?aba=`; `/site` redireciona; só `SITE` → só aba Site; ↑/↓ + salvar envia o corpo exato; descartar volta; aviso ao trocar de aba com ordem pendente; prévia só com ativos e oculta sem permissão; menu ⋯ com Restaurar; link de origem troca de aba.
- Site: `resolveHomeOrder` (ausente, inválido, desconhecido, faltando, válido).
- Ponta a ponta local: reordenar no painel e ver a nova ordem no site (API 3001, painel 8080, site 3000); conferir arrastar e setas no celular.
