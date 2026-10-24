# Contrato público — Conteúdo do site (`site-content`)

Conteúdo institucional editável no painel (**Igreja → Site**, `/igreja?aba=site`; `/site` redireciona para lá) e consumido pelo site público.

> **Estado:** implementado na API (`SiteModule`). O site público consome este endpoint.

---

## Fonte de cada dado

O endpoint monta a resposta a partir de três origens. Editar o dado na origem errada não tem efeito.

| Dado publicado | Fonte oficial | Onde se edita no painel |
|---|---|---|
| `contact.phone`, `.email`, `.address`, `.youtubeUrl`, `.instagramUrl`, `.facebookUrl` | `ChurchConfig` | Igreja → Ofertório, Redes Sociais e Contatos |
| `giving.pixKey`, `.bankName`, `.bankCode`, `.agency`, `.account`, `.holderName`, `.holderDocument` | `ChurchConfig` | idem |
| `churches.items[]` (inclui `mapsUrl` da sede) | tabela de filiais (`ChurchBranch`) | Igreja → Filiais |
| `pastors.items[]` | tabela `Pastor` | Igreja → Pastores |
| `ministries.items[]` | tabela `Ministry` | Igreja → Ministérios |
| Horários de culto | recurso `schedules` (`GET /api/public/tenants/:slug/schedules`), **fora** deste endpoint | Igreja → Agenda Semanal |
| Demais campos (`mission.*`, `celulas.*`, `visit.*`, `youtube.*`, cabeçalhos de `churches`/`pastors`/`giving`, `contact.tagline`/`copyright`) | tabela `site_content` (JSON por chave) mesclada sobre os defaults do registry | Igreja → Site |

Regras de precedência:

- Quando o tenant **já tem** registro de `ChurchConfig`, `contact.*` e `giving.*` vêm só dele. Campo limpo (`null`) sai como `""`; **nunca** é substituído por valor antigo do JSON legado de `site_content`.
- Só enquanto o tenant não tem `ChurchConfig` é que o valor do JSON legado/defaults é usado.
- `visit.hours` e `visit.address` são texto livre da seção Visite-nos; não são fonte oficial de horários nem de endereço.

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
  },
  "layout": {
    "home": ["mission", "schedules", "celulas", "events", "churches", "giving", "youtube"]
  }
}
```

`layout.home` é a ordem dos blocos do miolo da página inicial, definida em Igreja → Site. Contém sempre os 7 ids acima, uma vez cada (sem ordem salva, sai a ordem padrão mostrada). `schedules` e `events` não são secções deste endpoint: indicam onde renderizar a Agenda Semanal e os eventos. O topo (hero) e o rodapé (`contact`) são fixos e não entram na lista. O site deve tolerar ids desconhecidos (ignorar) e ids em falta (pôr na posição padrão), para continuar a funcionar se um bloco for acrescentado no futuro.

Para o painel: `GET /admin/tenants/me/site-content/layout` (`SITE:VIEW`) e `PUT` com `{ "home": [...] }` (`SITE:EDIT`; tem de ser uma permutação exata dos 7 ids, senão 400). Salvar dispara a mesma revalidação do conteúdo.

### Garantias do formato

1. **As 9 chaves existem sempre.** Uma secção de texto nunca editada devolve os defaults do registry. Não é preciso verificar `undefined` ao nível da secção.
2. **Todos os campos de uma secção existem sempre.** O valor gravado é mesclado por cima dos defaults, portanto um campo acrescentado à API depois da última edição aparece preenchido, não em falta. Campos de `ChurchConfig`, filiais, pastores e ministérios não têm default: sem dado saem `""`; as listas saem `[]`.
3. **Listas de tabelas só trazem itens ativos.** Filiais, pastores e ministérios com `active = false` não aparecem nesta rota (só no painel). Em listas do JSON de `site_content` (ex.: `celulas.benefits`), itens com `active: false` também são removidos. O campo `active` das listas de tabela continua no payload (sempre `true`).
4. **Ordenação.** Filiais: sede (`isHeadquarters`) primeiro, depois `sortOrder` crescente, depois `name`. Pastores e ministérios: `sortOrder` crescente, depois `name`. O próprio `sortOrder` não é publicado.
5. **Nada interno vaza.** Nenhum objeto da resposta contém `id`, `tenantId`, `createdAt`, `updatedAt` nem `sortOrder` (coberto por teste).

Todos os campos acima são `string` (ou `boolean` em `isHeadquarters`/`active`). Strings podem vir **vazias**.

**Strings vazias:** é o caso de `giving.account` e `giving.holderDocument`, que estão por preencher de propósito (ver [Pendências](#pendências)). Trate `""` como "não mostrar esta linha", não como erro.

---

## Campos por secção

### `mission` — Missão / Sobre
| Campo | Tipo | Conteúdo inicial |
|-------|------|------------------|
| `badge` | string | `Nossa Missão` |
| `titlePart1` | string | `O mesmo povo.` |
| `titleHighlight` | string | `A mesma fé.` |
| `titlePart2` | string | `Um nome novo.` |
| `paragraph1` | string | parágrafo de abertura |
| `paragraph2` | string | parágrafo de compromisso |
| `quote` | string | `Paraíso é a casa de Deus...` |
| `signature` | string | `Igreja Paraíso — Casa de Deus. Minha família.` |

> O título é servido em 3 partes. Os parágrafos são texto plano (sem marcação inline).

### `celulas` — Células
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
Texto livre de endereço e horários. Não é fonte oficial de horários (ver [Fonte de cada dado](#fonte-de-cada-dado)).

| Campo | Tipo | Notas |
|-------|------|-------|
| `titlePart1`, `titleHighlight` | string | `VENHA NOS` / `visitar` |
| `backgroundImage` | string | URL da imagem de fundo |
| `addressTitle`, `address` | string | `address` é **multilinha** (`\n`) — divida por `\n` ao renderizar |
| `hoursTitle`, `hours` | string | idem, multilinha |
| `mapsUrl` | string | link "Como chegar" |

### `churches` — Igrejas & Missões
Cabeçalho: `badge`, `titlePart1`, `titleHighlight`, `intro`.

`items[]`:

| Campo | Tipo | Notas |
|-------|------|-------|
| `name` | string | obrigatório |
| `location` | string | cidade |
| `address` | string | endereço completo |
| `image` | string | URL absoluto ou caminho relativo; `""` se não houver |
| `mapsUrl` | string | link do Google Maps; `""` se não houver |
| `isHeadquarters` | boolean | identifica a sede (não a posição no array) |
| `active` | boolean | sempre `true` nesta rota |

Não existe campo `pastor` em filiais.

### `pastors` — Time Pastoral
Cabeçalho: `badge`, `titlePart1`, `titleHighlight`, `intro`.

`items[]`: `name` (obrigatório), `image`, `active`.

Pastores não têm outros campos (`role`, `location`, `church` não existem).

### `ministries` — Ministérios
Só `items[]`: `name` (obrigatório), `description`, `icon`, `image`, `active`. `icon` é **texto livre** (até 64 caracteres, `""` se vazio); não é validado contra a lista de ícones.

### `giving` — Ofertório
`badge`, `titlePart1`, `titleHighlight`, `titlePart2`, `intro` (JSON), depois `pixKey`, `bankName`, `bankCode`, `agency`, `account`, `holderName`, `holderDocument` (`ChurchConfig`).

⚠️ `account` e `holderDocument` vêm **vazios**. Ver [Pendências](#pendências).

### `contact` — Contato & Rodapé
Ordem das chaves: `tagline`, `copyright` (JSON), depois `phone`, `email`, `address`, `youtubeUrl`, `instagramUrl`, `facebookUrl` (`ChurchConfig`).

### `youtube` — Transmissões
`channelHandle` (sem `@`), `sectionTitle`.

⚠️ Servido como `paraisoigreja`. O código atual (`LatestStream.tsx:22`) usa `ibrejetibaoficial` — ver [Pendências](#pendências).

---

## Valores válidos de `icon`

Em `celulas.benefits[].icon` o valor é um **enum fechado**, validado na escrita — a API rejeita qualquer outro com `400`. Correspondem a nomes de `lucide-react`:

```
Heart · Users · BookOpen · MapPin · Music · Church · Calendar
Star · Sparkles · HandHeart · Baby · Flame · Globe · Phone · Mail
```

`ministries.items[].icon` **não** segue este enum: é texto livre (ver `ministries`). Faça o lookup com um mapa explícito e trate nome desconhecido sem quebrar.

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

O consumidor decide o próprio cache (o site usa a tag `site-content`). A API apenas **avisa** após cada gravação do painel em: seções do site (PUT/DELETE), Igreja (`church-config`), filiais, pastores, ministérios e agenda semanal. Se `SITE_REVALIDATION_SECRET` e `SITE_REVALIDATION_TARGETS` estiverem definidos, para cada destino do tenant, em paralelo e com timeout de 5 s:

```http
GET {destino}/api/revalidate-site-content
x-revalidation-secret: {SITE_REVALIDATION_SECRET}
```

```env
SITE_REVALIDATION_TARGETS={"paraiso":["https://site-producao","https://site-homologacao"]}
```

- Chave = slug do tenant; os destinos são configuração da plataforma, **não** as origens CORS do tenant. Tenant sem entrada → não revalida.
- Só `https` (`http` apenas para localhost fora de produção). JSON inválido → erro no log e revalidação desativada; a API sobe normalmente.
- O segredo vai só no header, nunca na URL nem no log.
- Não bloqueante: falhas só entram no log; a gravação no painel nunca falha por causa da revalidação.

### CORS

Não é preciso fazer nada **se buscar do servidor** (server components / route handlers), que é o padrão já usado para eventos — pedidos server-side não passam por CORS.

Se algum componente `"use client"` chamar o endpoint diretamente do browser, aí a origem do site tem de constar em `TenantPublicWebOrigin` para aquele tenant, senão o browser bloqueia. A rota `/public/tenants/:slug/*` já está coberta pelo middleware de CORS dinâmico — o que falta nesse caso é só registar a origem.

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
