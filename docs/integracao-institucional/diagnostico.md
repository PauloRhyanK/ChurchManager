# Integração institucional ChurchManager ↔ Site — diagnóstico (Fase 1)

> Auditoria feita em 2026-10-21, sem alterar código. Estado medido: ChurchManager `qa` = `main` = `3af89d5`; site `igreja-paraiso` `homologacao` = `master` = `13055ee`.
> Planos de correção: Seeds `pl-a788` (este repositório, épico `CHURCH-3438`) e `pl-5edb` (repositório do site, épico `PARAISO-3730`).
> Roteiro de validação ponta a ponta: [roteiro-e2e.md](roteiro-e2e.md).

## 1. Inventário

### 1.1 Telas do painel (`apps/admin`) com escrita

| Rota | Componente | Escrita | Payload | Situação |
|---|---|---|---|---|
| `/igreja` → Filiais | `features/church/pages/ChurchPage.tsx` | POST/PUT/DELETE `/admin/tenants/me/branches[/:id]` | criação: literal; **edição: objeto do GET** | **edição dá 400** |
| `/igreja` → Pastores | idem | `/admin/tenants/me/pastors[/:id]` | idem | **edição dá 400** |
| `/igreja` → Ministérios | idem | `/admin/tenants/me/ministries[/:id]` | idem | **edição dá 400** |
| `/igreja` → Agenda Semanal | idem | `/admin/tenants/me/schedules[/:id]` | edição: `{...schedule}` | **edição dá 400** (id, createdAt) |
| `/igreja` → Ofertório, Redes e Contatos | idem | PUT `/admin/tenants/me/church-config` | pick dos 13 campos (`:715-729`) | ok; **sem estado de erro** |
| `/igreja` (imagens) | `components/ImageUploader.tsx` | POST `/admin/tenants/me/church-config/upload-image` | multipart `file` | sem limite de tamanho |
| `/site` | `features/site/pages/SitePage.tsx`, `SiteSectionSheet.tsx` | PUT/DELETE `/admin/tenants/me/site-content/:key`, POST `/upload-image` | `{value}` | ok; rascunho pode ser descartado em refetch (suspeita) |
| `/eventos/*` | `EventFormPage.tsx` e afins | `/events…` | pick (`eventFormToApiBody`) | ok (fora do escopo, regressão a vigiar no upload) |
| Acesso, Configurações, Check-in, Plataforma | vários | vários | literais explícitos | ok |

### 1.2 Endpoints da API (`apps/api`, prefixo `/api`, tenant sempre do JWT)

| Recurso | Leitura | Escrita | Permissão |
|---|---|---|---|
| church-config | GET `admin/tenants/me/church-config` (linha Prisma completa) | PUT (13 campos opcionais) | CHURCH:VIEW / CHURCH:EDIT |
| branches, pastors, ministries | GET lista e `/:id` (linha completa) | POST, PUT `/:id`, DELETE `/:id` | CHURCH:VIEW / CHURCH:EDIT |
| schedules | GET `admin/tenants/me/schedules` (`toScheduleDto`) | POST, PUT, DELETE | ver controller (módulo events) |
| site-content | GET `admin/tenants/me/site-content[/:key]`, `/schema` | PUT `/:key` `{value}`, DELETE `/:key` | SITE:VIEW / SITE:EDIT |
| uploads | — | POST `church-config/upload-image`, `site-content/upload-image`, `events/upload-cover` | EDIT do módulo |
| **público** | GET `public/tenants/:slug/site-content`, `/schedules`, `/events`, `/events/:id` | — | nenhuma |

Validação global: `ValidationPipe({ whitelist, forbidNonWhitelisted, transform, enableImplicitConversion })` em `apps/api/src/main.ts:14-19` — é intencional e **não** deve ser afrouxada.

### 1.3 Páginas do site e fonte efetiva dos dados

| Página | Conteúdo | Fonte | Endpoint | Cache |
|---|---|---|---|---|
| `/` | missão, células, igrejas, ofertório, youtube | API | `site-content` | 300 s + tag `site-content` (prod); no-store (Preview) |
| `/` | programação | API | `/schedules` | **300 s sem tag** |
| `/` | eventos | API | `/events?upcomingOnly=true` | 60 s |
| `/` | hero | fixo no código | — | — |
| rodapé | contato | API | `site-content` (`contact`) | idem |
| `/nossas-igrejas` | filiais | API | `site-content` (`churches`) | ISR; **imagens R2 quebram** (`next/image` sem host) |
| `/time-pastoral` | pastores | API | `site-content` (`pastors`) | ISR; **imagens R2 quebram** |
| `/contato` | endereço, telefone, horários | **fixo no código** | — | — |
| `/sobre` | pastor presidente | fixo no código (fora do CMS) | — | — |
| `/admin/*` (site) | **painel paralelo legado** | API admin com **e-mail e senha de administrador** no ambiente do site | `admin/tenants/me/events|schedules|registrations` | — |
| `/membros/*` | área de membros | Supabase (legado, fora do escopo) | — | — |

Seções que a API publica e o site não exibe hoje: `visit`, `ministries` (decisão do site; o painel não depende disso).

## 2. Mapa do fluxo painel → site

```
Painel (/igreja, /site)
  └─ HTTP + JWT ─► API Nest (ValidationPipe whitelist) ─► Postgres (tabelas por tenantId)
                     │                                     └─ R2 (imagens: tenants/{tenantId}/church|site/{uuid}.{ext})
                     ├─ notifyContentChanged() ── fire-and-forget ─► site GET /api/revalidate-site-content  ─► revalidateTag('site-content','max')
                     │      (hoje: CRUD de church e site-content; NÃO o de schedules)
                     └─ GET /api/public/tenants/:slug/site-content  ◄── site (fetch com revalidate 300 + tag)
                        (junta site_content + branches/pastors/ministries ativos + ChurchConfig)
```

Revalidação hoje: segredo global `SITE_REVALIDATION_SECRET` em query string, enviado à **primeira origem CORS cadastrada pelo próprio tenant**.

## 3. Fonte oficial por campo (decisão de 2026-10-21)

| Dado | Fonte oficial | Onde se edita | Observação |
|---|---|---|---|
| Endereço, telefone, e-mail da igreja | `ChurchConfig` (`address`, `phone`, `email`) | `/igreja` → Ofertório, Redes e Contatos | publicado em `contact.*` |
| Redes sociais | `ChurchConfig` (`youtubeUrl`, `instagramUrl`, `facebookUrl`) | idem | publicado em `contact.*` |
| PIX e dados bancários | `ChurchConfig` | idem | publicado em `giving.*` |
| Link do Google Maps da sede | filial com `isHeadquarters = true` (`mapsUrl`) | `/igreja` → Filiais | publicado em `churches.items[]` |
| Horários de culto | tabela de horários (`schedules`) | `/igreja` → Agenda Semanal | endpoint `/schedules`; `visit.hours` é texto livre da seção Visite-nos e **não** é fonte de horários |
| Filiais, pastores, ministérios | tabelas `ChurchBranch`, `Pastor`, `Ministry` (só `active`) | `/igreja` | o JSON legado de `site_content` não é mais fonte de listas |
| Textos editoriais (missão, células, visite-nos, youtube) | `site_content` | `/site` | — |

`visit.address` continua existindo como texto da seção Visite-nos; o site não o usa como endereço oficial.

## 4. Problemas confirmados (por gravidade)

| # | Gravidade | Problema | Evidência | Plano |
|---|---|---|---|---|
| 1 | crítica | Edição de filial, pastor, ministério e horário sempre dá 400 | `ChurchPage.tsx:126-202` reenvia o GET; reproduzido: PUT com objeto do GET → 400 `property id/tenantId/createdAt/updatedAt should not exist`; só campos aceitos → 200 | CHURCH-934f |
| 2 | alta | Ofertório salva `null` por cima de tudo se o GET falhar | `ChurchPage.tsx:706` só trata `isLoading` | CHURCH-eaa3 |
| 3 | alta | Revalidação pode derrubar a API | `site-revalidation.service.ts:22-36` (`void run()`, `findMany` fora do try) | CHURCH-48d6 |
| 4 | alta | Segredo global de revalidação vaza para host cadastrado pelo tenant | `site-revalidation.service.ts:42` + origens CORS editáveis pelo tenant | CHURCH-48d6, PARAISO-6072 |
| 5 | alta | Imagens do R2 quebram em `/nossas-igrejas` e `/time-pastoral` | `next.config.ts` sem o host; `next/image` nas páginas | PARAISO-726c |
| 6 | alta | Site guarda credencial de administrador do ChurchManager para o painel paralelo | `src/lib/admin-api/client.ts:25-26` (`CHURCHMANAGER_ADMIN_EMAIL/PASSWORD`) | PARAISO (remoção do admin paralelo) |
| 7 | média | Upload sem limite, MIME do cliente, SVG servido, erro do SDK exposto, sem checksum `WHEN_REQUIRED` | `storage.service.ts:13-66,108-117`; `FileInterceptor` sem `limits` | CHURCH-1705 |
| 8 | média | Itens removidos reaparecem quando a API falha | `data.ts:55` + `fallbacks.ts:80-243` | PARAISO-03d7 |
| 9 | média | Agenda Semanal não revalida o site (até 300 s de atraso) | serviço de schedules não chama `notifyContentChanged`; `events/client.ts:125-130` sem tag | CHURCH-48d6, PARAISO-6072 |
| 10 | média | Migração legada roda a cada boot e apaga `site_content` de ministries | `site-content.service.ts:235-342` | CHURCH-20a3 |
| 11 | média | Links `javascript:` aceitos nos campos de URL | DTOs de church sem `IsUrl` | CHURCH-934f |
| 12 | média | `/contato` com dados fixos divergentes do painel | `contato/page.tsx:28-75` | PARAISO-17fd |
| 13 | média | Perda de alterações não salvas; erro cru em inglês | sem `isDirty`/`beforeunload`; `lib/api.ts:35-45` | CHURCH-eaa3 |
| 14 | baixa | Tela Igreja ignora `CHURCH:VIEW` | sem `usePermissions` na ChurchPage | CHURCH-eaa3 |
| 15 | baixa | Booleano `'false'` vira `true`; `null` vira `''` | `enableImplicitConversion`; Transform em `update-branch.dto.ts:15` | CHURCH-934f |
| 16 | baixa | Contrato documentado diverge do código; tipos do site mentem | `docs/api/site-content-contract.md`; `types.ts:82,100-108` | CHURCH-20a3, PARAISO-03d7 |
| 17 | baixa | `PERMISSION_MODULES` do backend sem CHURCH | `access/permissions.ts:4-14` | CHURCH-20a3 |

**Não confirmado (a provar):** causa real das falhas de upload no R2 em ambiente com credenciais reais (hipótese: checksums do SDK); descarte do rascunho do `SiteSectionSheet` em refetch.

**Verificado sem problema:** isolamento por tenant em leitura/escrita (todo `where` com `tenantId`); chave R2 com o tenant; endpoint público não expõe id/tenantId/timestamps nem itens inativos.

## 5. Limites de atualização do site (definidos em 2026-10-21)

| Cenário | Limite |
|---|---|
| Revalidação configurada e bem-sucedida | a **próxima** visita já mostra o conteúdo novo (site-content e programação) |
| Revalidação falhou ou não configurada | no máximo **300 s** |
| Preview da Vercel (homologação) | sem cache (cada visita lê a API) |
| Eventos | no máximo 60 s (fora do escopo de revalidação) |
| API fora do ar | só textos de reserva; nenhuma lista com dados fixos |

## 6. Dependências entre correções

- ChurchManager: `CHURCH-184d` (portão) → `CHURCH-934f` (contrato) → `CHURCH-eaa3` (estados) → `CHURCH-1705` (upload); `CHURCH-48d6` (revalidação) e `CHURCH-20a3` (contrato público) após o portão; `CHURCH-d020` (integração) por último.
- Site: `PARAISO-f1c3` (portão) → imagens, reserva/tipos, revalidação e remoção do admin paralelo; `/contato` após reserva/tipos; integração por último.
- Entre repositórios: o site aceita o segredo no header antes ou junto da API (a query continua aceita na transição). A API em produção só deve publicar a revalidação nova com `SITE_REVALIDATION_TARGETS` configurada.
- Validação conjunta dos dois repositórios: [roteiro-e2e.md](roteiro-e2e.md), executado fora do Warren.
