# Contrato público — Conteúdo do site (`site-content`)

Conteúdo institucional editável no painel (**Gestão do Site**, `/site`) e consumido pelo site público.
Substitui o que hoje está hardcoded em `src/constants.tsx` e nos componentes de secção do repositório do site.

> **Estado:** implementado na API (`SiteModule`). O site público consome este endpoint.

---

## Alinhamento com o site (2026)

O site **não renderiza** todos os campos do JSON. O painel **Gestão do Site** foi alinhado ao que aparece no site:

| Campo / secção | No site | No painel |
|----------------|---------|-----------|
| `churches.items[].address` | **Crítico** — mapa embed + texto em `/igrejas` | Obrigatório para itens visíveis (`active !== false`) |
| `churches.items[].pastor` | Não exibido | Removido do formulário; pode existir em dados antigos até nova gravação |
| `churches.items[].mapsUrl` | Só botão «Como chegar» externo | Opcional |
| `pastors.items[]` | Só `name` + `image` em `/time-pastoral` | Formulário só com nome, foto e visibilidade |
| `pastors.items[].role`, `.location`, `.church` | Não exibidos | Removidos do formulário |
| `visit` | Secção removida da home atual | Continua editável (dados na API) |
| **Eventos na home** | `GET .../events?upcomingOnly=true` | Módulo **Eventos** do painel, não esta API |
| **Programação na home** | `GET .../schedules` | Sem ecrã no painel (só API) |

---

## Endpoint

```http
GET {API_ORIGIN}/api/public/tenants/{slug}/site-content
```

Sem autenticação. Devolve **todas** as secções num único pedido.

```json
{
  "sections": {
    "mission":    { "...": "..." },
    "celulas":    { "...": "..." },
    "visit":      { "...": "..." },
    "churches":   { "...": "..." },
    "pastors":    { "...": "..." },
    "ministries": { "...": "..." },
    "giving":     { "...": "..." },
    "contact":    { "...": "..." },
    "youtube":    { "...": "..." }
  }
}
```

### Três garantias que simplificam o consumo

1. **As 9 chaves existem sempre.** Uma secção nunca editada devolve o conteúdo inicial (o texto que está hoje no site). Não é preciso verificar `undefined` ao nível da secção.
2. **Todos os campos de uma secção existem sempre.** O valor gravado é mesclado por cima dos defaults, portanto um campo acrescentado à API depois da última edição aparece preenchido, não em falta.
3. **As listas já vêm filtradas.** Itens com `active: false` são removidos nesta rota (só aparecem no painel). O campo `active` continua no payload.

**O que não é garantido:** strings podem vir **vazias** (`""`). É o caso de `giving.account` e `giving.holderDocument`, que estão por preencher de propósito (ver [Pendências](#pendências)). Trate `""` como "não mostrar esta linha", não como erro.

---

## Campos por secção

### `mission` — Missão / Sobre
Substitui `MissionSection.tsx`.

| Campo | Tipo | Conteúdo inicial |
|-------|------|------------------|
| `badge` | string | `Nossa Missão` |
| `titlePart1` | string | `O mesmo povo.` |
| `titleHighlight` | string | `A mesma fé.` — renderizada a verde/itálico |
| `titlePart2` | string | `Um nome novo.` |
| `paragraph1` | string | parágrafo de abertura |
| `paragraph2` | string | parágrafo de compromisso |
| `quote` | string | `Paraíso é a casa de Deus...` |
| `signature` | string | `Igreja Paraíso — Casa de Deus. Minha família.` |

> O título é servido em 3 partes porque a parte do meio tem estilo próprio. O `<strong>`/`<em>` que hoje existe dentro dos parágrafos **não** é representado — o texto vem plano. Se a ênfase inline importar, aplique-a no componente ou peça um campo dedicado.

### `celulas` — Células
Substitui `CelulasSection.tsx`.

| Campo | Tipo | Notas |
|-------|------|-------|
| `badge`, `titlePart1`, `titleHighlight`, `titlePart2` | string | mesmo padrão de `mission` |
| `paragraph1`, `paragraph2` | string | |
| `verseText` | string | `Onde dois ou três se reúnem...` |
| `verseReference` | string | `Mateus 18:20` — sem o travessão, adicione no componente |
| `benefits` | array | `{ icon, titulo, descricao }` — 4 itens iniciais |
| `ctaLabel` | string | `Quero encontrar uma célula` |
| `ctaUrl` | string | `/membros` |

### `visit` — Venha nos visitar
Conteúdo institucional de endereço/horários. **A home atual do site já não inclui este bloco**; a chave continua na API para compatibilidade.

| Campo | Tipo | Notas |
|-------|------|-------|
| `titlePart1`, `titleHighlight` | string | `VENHA NOS` / `visitar` |
| `backgroundImage` | string | URL da imagem de fundo |
| `addressTitle`, `address` | string | `address` é **multilinha** (`\n`) — divida por `\n` ao renderizar |
| `hoursTitle`, `hours` | string | idem, multilinha |
| `mapsUrl` | string | link "Como chegar" |

### `churches` — Igrejas & Missões
Home (bloco missões) e página **Nossas Igrejas** (`/igrejas`).

Cabeçalho: `badge`, `titlePart1`, `titleHighlight`, `intro`.

`items[]`:

| Campo | Tipo | Notas |
|-------|------|-------|
| `name` | string | obrigatório |
| `location` | string | cidade; fallback se `address` vazio no site |
| `address` | string | **obrigatório no painel** para itens visíveis — endereço geocodável para mapa embed |
| `pastor` | string | legado — **não exibido no site**; pode vir em JSON antigo |
| `image` | string | URL absoluto ou caminho relativo (`/pastor.jpg`) |
| `mapsUrl` | string | botão externo «Como chegar»; mapa embed usa `address` |
| `isHeadquarters` | boolean | **use isto para identificar a sede**, não a posição no array |
| `active` | boolean | sempre `true` nesta rota pública |

### `pastors` — Time Pastoral
Página `/time-pastoral` — grid **só nome e foto**.

Cabeçalho: `badge`, `titlePart1`, `titleHighlight`, `intro`.

`items[]`: `name` (obrigatório), `image`, `active`.

Campos legados (`role`, `location`, `church`) podem existir em gravações antigas mas **não são editados no painel** nem renderizados no site.

### `ministries` — Ministérios
Substitui `MINISTRIES`. Só `items[]`: `name` (obrigatório), `description`, `icon`, `image`, `active`.

### `giving` — Ofertório
Substitui os dados hardcoded em `OfertorioSection.tsx`.

`badge`, `titlePart1`, `titleHighlight`, `titlePart2`, `intro`, `pixKey`, `bankName`, `bankCode`, `agency`, `account`, `holderName`, `holderDocument`.

⚠️ `account` e `holderDocument` vêm **vazios**. Ver [Pendências](#pendências).

### `contact` — Contato & Rodapé
Substitui os dados de `Footer.tsx` e `SOCIAL_LINKS`.

`phone`, `email`, `address`, `tagline`, `copyright`, `youtubeUrl`, `instagramUrl`, `facebookUrl`.

### `youtube` — Transmissões
`channelHandle` (sem `@`), `sectionTitle`.

⚠️ Servido como `paraisoigreja`. O código atual (`LatestStream.tsx:22`) usa `ibrejetibaoficial` — ver [Pendências](#pendências).

---

## Valores válidos de `icon`

Campos `icon` (em `celulas.benefits` e `ministries.items`) são um **enum fechado**, validado na escrita — a API rejeita qualquer outro valor com `400`. Correspondem a nomes de `lucide-react`:

```
Heart · Users · BookOpen · MapPin · Music · Church · Calendar
Star · Sparkles · HandHeart · Baby · Flame · Globe · Phone · Mail
```

Faça o lookup com um mapa explícito, não `import * as lucide` (arrasta o pacote inteiro para o bundle). Há um exemplo em `apps/admin/src/features/site/components/site-icons.tsx`.

---

## Integração no site (`igreja-paraiso`)

O site já tem toda a infraestrutura para isto — reutilize, não crie nada novo:

- `src/lib/public-api/env.ts` → `getPublicApiBase()`, `getTenantSlug()`, `isPublicApiConfigured()`
- Variáveis já configuradas: `NEXT_PUBLIC_DONATIONS_API_BASE`, `NEXT_PUBLIC_DONATIONS_TENANT_SLUG`
- Padrão de camadas em `src/lib/events/`: `client.ts` (fetch) → `adapters.ts` (DTO→tipo do site) → `data.ts` (usado pelos server components)

Sugestão: `src/lib/site-content/` com a mesma divisão.

### Cliente

```ts
// src/lib/site-content/client.ts
import { getPublicApiBase, getTenantSlug } from "@/lib/public-api/env";
import type { SiteContentResponse } from "./types";

export async function fetchSiteContent(): Promise<SiteContentResponse> {
  const base = getPublicApiBase();
  const slug = getTenantSlug();
  if (!base || !slug) throw new Error("API pública não configurada.");

  const res = await fetch(
    `${base}/api/public/tenants/${encodeURIComponent(slug)}/site-content`,
    // Conteúdo institucional muda raramente — cache longo. Ver nota de revalidação.
    { headers: { Accept: "application/json" }, next: { revalidate: 300, tags: ["site-content"] } },
  );

  if (!res.ok) throw new Error(`site-content ${res.status}`);
  return res.json();
}
```

### Consumo com fallback

O site tem de continuar a renderizar se a API estiver em baixo. Mantenha `constants.tsx` como fallback **durante a migração** e só o apague quando todas as secções estiverem ligadas e validadas em QA.

```ts
// src/lib/site-content/data.ts
export async function getSiteContent(): Promise<SiteContentResponse["sections"] | null> {
  if (!isPublicApiConfigured()) return null;
  try {
    const { sections } = await fetchSiteContent();
    return sections;
  } catch (error) {
    console.warn("[site-content] a usar fallback estático:", error);
    return null;
  }
}
```

Como as secções são todas servidas juntas, **busque uma vez no layout ou na página** e passe por props, em vez de cada componente fazer o seu fetch.

### Cache e revalidação

O site usa cache ISR/tag `site-content` (ex.: `revalidate: 300` ou tag dedicada).

**ChurchManager (painel):** após `PUT` ou `DELETE` numa secção, se `SITE_REVALIDATION_SECRET` estiver definido na API **e** existir pelo menos uma origem em `tenant_public_web_origins`, a API faz:

```http
GET {primeira_origem}/api/revalidate-site-content?secret={SITE_REVALIDATION_SECRET}
```

Fire-and-forget — falhas só entram em log; o save no painel não falha. Em dev local, omita o secret ou não registe origem.

**Preview/QA do site:** conteúdo pode correr com `no-store`; o webhook pode não ser necessário.

### CORS

Não é preciso fazer nada **se buscar do servidor** (server components / route handlers), que é o padrão já usado para eventos — pedidos server-side não passam por CORS.

Se algum componente `"use client"` chamar o endpoint diretamente do browser, aí a origem do site tem de constar em `TenantPublicWebOrigin` para aquele tenant, senão o browser bloqueia. A rota `/public/tenants/:slug/*` já está coberta pelo middleware de CORS dinâmico — o que falta nesse caso é só registar a origem.

---

## Ordem de migração sugerida

Secção a secção, validando em QA entre cada uma. Comece pelas de texto puro (risco baixo) e deixe as financeiras para o fim.

| # | Secção | Ficheiro no site | Risco |
|---|--------|------------------|-------|
| 1 | `mission` | `MissionSection.tsx` | baixo |
| 2 | `celulas` | `CelulasSection.tsx` | baixo |
| 3 | `visit` | `(site)/page.tsx` (`#onde`) | baixo |
| 4 | `contact` | `Footer.tsx`, `SOCIAL_LINKS` | baixo |
| 5 | `churches` | `Missions.tsx`, `nossas-igrejas/page.tsx` | médio — listas |
| 6 | `pastors` | `time-pastoral/page.tsx` | médio — listas |
| 7 | `ministries` | `Ministries.tsx` | **não renderizado hoje** — confirmar se entra |
| 8 | `youtube` | `LatestStream.tsx` | ver pendência do handle |
| 9 | `giving` | `OfertorioSection.tsx` | **bloqueado** — ver pendências |

---

## Pendências (decisões fora do código)

Três coisas precisam de resposta antes de as secções correspondentes irem para produção:

1. **Dados bancários.** `account` e `holderDocument` foram deixados **vazios** de propósito. Os valores em produção hoje (`12.345-6` e `12.345.678/0001-90`) são placeholders óbvios, e copiá-los para o CMS só lhes daria aparência de legitimidade. Os reais têm de vir da tesouraria. **Enquanto estiverem vazios, o card de transferência bancária não deve ser renderizado.**
2. **Chave PIX.** `projeto@visaodofuturo.com.br` usa o domínio do nome antigo. Confirmar com a tesouraria se a conta continua ativa após o rebrand.
3. **Canal do YouTube.** O site liga para `@paraisoigreja` mas `LatestStream.tsx` busca vídeos de `ibrejetibaoficial`. A API serve `paraisoigreja` como inicial. Se estiver certo, a secção "Última Transmissão" está hoje a mostrar conteúdo do canal antigo — é um bug pré-existente que esta migração corrige.

E uma divergência de dados que não é resolvida por este contrato:

4. **Horários de culto em três fontes diferentes** — `SERVICE_TIMES` diz domingo 09h/18:30, `PROGRAMACAO` diz 10h/18h, a home diz 09h/18h30. `visit.hours` foi seedado com o texto da home, mas os horários "a sério" vivem no recurso **`schedules`** (`GET /api/public/tenants/:slug/schedules`), que já existe e já é consumido pelo site. Defina qual é o correto e, idealmente, faça `visit.hours` deixar de ser texto livre e passar a derivar de `schedules`.

---

## Ver também

- `apps/api/src/modules/site/site-content.registry.ts` — fonte de verdade dos campos, validação e conteúdo inicial. Acrescentar um campo é uma linha aqui; o painel desenha-o sozinho.
- `GET /api/admin/tenants/me/site-content/schema` (autenticado) — o mesmo registry em JSON, se precisar de gerar tipos.
- [events-api-reference.md](./events-api-reference.md) — padrão de consumo já implementado no site.
