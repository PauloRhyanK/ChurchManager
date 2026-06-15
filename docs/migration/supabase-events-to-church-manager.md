# Migração — Eventos Supabase → Church Manager

Documento de referência para replicar o módulo editorial de eventos do site **igreja-paraiso** na API Nest.js multitenant.

## Decisão

**Não** recriamos `CREATE TABLE` no repo legado. O schema canónico passa a ser o Prisma deste monorepo (`apps/api/prisma/schema.prisma`) + migration `20260612210000_events_module`.

## Diferenças em relação ao Supabase

| Aspecto | Supabase (legado) | Church Manager |
|---------|-------------------|----------------|
| Multitenancy | Uma igreja por projecto | `tenant_id` em todas as tabelas |
| Auth admin | `user_roles` + RLS | JWT + `AdminUser` |
| Auth site | `auth.users` | `user_id` opcional (UUID sem FK) até existir auth de membros |
| Nomes API | snake_case no client | camelCase na API (`timeStart`, `imageUrl`) |
| RLS | PostgREST | Filtro `tenant_id` nos services |

## Mapeamento de colunas

### `events`

| Supabase | Prisma / API |
|----------|--------------|
| `id` | `id` |
| — | `tenantId` (**novo**) |
| `title` | `title` |
| `description` | `description` |
| `date` | `date` (`YYYY-MM-DD`) |
| `time_start` | `timeStart` (`HH:MM:SS`) |
| `time_end` | `timeEnd` |
| `location` | `location` |
| `image_url` | `imageUrl` |
| `tag` | `tag` |
| `published` | `published` |
| `created_at` | `createdAt` |
| `updated_at` | `updatedAt` |

### `event_registrations`

| Supabase | Prisma / API |
|----------|--------------|
| `id` | `id` |
| — | `tenantId` (**novo**) |
| `event_id` | `eventId` |
| `name` | `name` |
| `email` | `email` (sempre lowercase) |
| `phone` | `phone` |
| `message` | `message` |
| `user_id` | `userId` (nullable, sem FK) |
| `created_at` | `createdAt` |

Constraint: `UNIQUE (event_id, email)` → mantida como `@@unique([eventId, email])`.

### `schedules`

| Supabase | Prisma / API |
|----------|--------------|
| `id` | `id` |
| — | `tenantId` (**novo**) |
| `title` | `title` |
| `day_of_week` | `dayOfWeek` |
| `time_start` | `timeStart` |
| `location` | `location` |
| `description` | `description` |
| `active` | `active` |
| `sort_order` | `sortOrder` |
| `created_at` | `createdAt` |

## Endpoints (substituem Supabase)

Prefixo global: `/api`.

### Admin (Bearer JWT)

| Método | Caminho | Equivalente legado |
|--------|---------|-------------------|
| GET | `/admin/tenants/me/events` | `select * from events` |
| GET | `/admin/tenants/me/events/:id` | detalhe |
| POST | `/admin/tenants/me/events` | insert |
| PUT | `/admin/tenants/me/events/:id` | update |
| DELETE | `/admin/tenants/me/events/:id` | delete |
| GET | `/admin/tenants/me/registrations` | `/admin/inscricoes` |
| GET | `/admin/tenants/me/events/:eventId/registrations` | inscrições por evento |
| GET/POST/PUT/DELETE | `/admin/tenants/me/schedules` | programação semanal |

### Público (`:slug` = tenant)

| Método | Caminho | Equivalente legado |
|--------|---------|-------------------|
| GET | `/public/tenants/:slug/events/published` | Home — publicados, por data |
| GET | `/public/tenants/:slug/events?upcomingOnly=true` | `/eventos` — futuros |
| GET | `/public/tenants/:slug/events/:eventId` | `/evento/[id]` |
| POST | `/public/tenants/:slug/events/:eventId/registrations` | modal de inscrição |
| GET | `/public/tenants/:slug/events/:eventId/registrations/check?email=` | verificar inscrição |
| GET | `/public/tenants/:slug/registrations/mine?email=&userId=` | minhas inscrições |
| GET | `/public/tenants/:slug/schedules` | programação activa |

## Regras de negócio replicadas

1. E-mail único por evento → `409` com mensagem *"Você já está inscrito neste evento"*
2. E-mail sempre em lowercase no insert
3. `userId` opcional (inscrição anónima)
4. Site só lista eventos com `published = true` (endpoints públicos)
5. Listagem futura: query `upcomingOnly=true`
6. Delete de evento cascadeia inscrições (`ON DELETE CASCADE`)

## ETL — importar dados do Supabase

1. Identificar o `tenant_id` da igreja no Church Manager (ex. slug `paraiso`).
2. Exportar CSV/SQL do Supabase:

```sql
-- events
COPY (SELECT id, title, description, date, time_start, time_end,
             location, image_url, tag, published, created_at, updated_at
      FROM public.events) TO STDOUT WITH CSV HEADER;

-- event_registrations
COPY (SELECT id, event_id, name, lower(email), phone, message, user_id, created_at
      FROM public.event_registrations) TO STDOUT WITH CSV HEADER;

-- schedules
COPY (SELECT id, title, day_of_week, time_start, location, description,
             active, sort_order, created_at
      FROM public.schedules) TO STDOUT WITH CSV HEADER;
```

3. Inserir com `tenant_id` fixo:

```sql
INSERT INTO events (id, tenant_id, title, description, date, time_start, time_end,
                    location, image_url, tag, published, created_at, updated_at)
SELECT id, 'TENANT_UUID_AQUI'::uuid, title, description, date, time_start, time_end,
       location, image_url, tag, published, created_at, updated_at
FROM staging_events;
```

Repetir para `event_registrations` e `schedules`.

## O que ainda **não** existe (fase futura)

Campos discutidos na reunião mas ausentes no Supabase legado:

- Preço / pagamento Asaas por evento
- Capacidade máxima e encerramento de inscrições
- `end_date` para eventos longos
- Upload de imagem (hoje só URL)

Ver contrato avançado em [events-public-contract.md](../api/events-public-contract.md) e issues Linear M2+.

## Ficheiros do site legado a alterar

| Ficheiro | Mudança |
|----------|---------|
| `src/app/admin/eventos/page.tsx` | Supabase → REST admin |
| `src/app/admin/inscricoes/page.tsx` | REST registrations |
| `src/components/EventRegistrationModal.tsx` | POST público |
| `src/app/(site)/page.tsx` | GET published |
| `src/app/(site)/eventos/page.tsx` | GET upcomingOnly |
| `src/app/evento/[id]/page.tsx` | GET detalhe + check |

Configurar CORS: origem do site em `tenant_public_web_origins` (painel admin).
