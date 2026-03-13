
### 1. Mapa Macro da Arquitetura (O Ecossistema)

A nossa arquitetura não será um monolito tradicional em Node.js. Será uma arquitetura descentralizada, orientada a serviços geridos (BaaS), também conhecida como **Arquitetura Headless composable**.

* **Pilar 1: Backend & Data Layer (Supabase)**
* **PostgreSQL:** O coração do sistema. Onde os dados multitenant vivem.
* **GoTrue (Auth):** Gere os tokens JWT e as sessões de login dos administradores.
* **PostgREST (A "Magia" dos Endpoints):** O Supabase gera automaticamente uma API RESTful completa e documentada (com Swagger/OpenAPI) a partir das nossas tabelas do PostgreSQL.
* **Storage:** Bucket S3-compatible para as fotos e banners.


* **Pilar 2: Painel Admin (React / Vite)**
* **Papel:** Aplicação *Single Page Application* (SPA) restrita a utilizadores autenticados.
* **Comunicação:** Usa o SDK `@supabase/supabase-js` para interagir diretamente com o banco de dados via a API do PostgREST, respeitando as regras de segurança (RLS).


* **Pilar 3: Site Público (Next.js - `igreja-paraiso`)**
* **Papel:** *Server-Side Rendering* (SSR) ou *Static Site Generation* (SSG) para SEO e alta performance.
* **Comunicação:** O Next.js fará requisições *read-only* (apenas leitura) à API do Supabase para montar a página com os eventos e textos da igreja.



---

### 2. Estratégia de Módulos e "Endpoints"

Aqui está a virada de chave: **Nós não vamos programar endpoints Node.js/Express do zero para o CRUD básico.** O Supabase já faz isso. O esforço dos devs será focado em modelar bem as tabelas e escrever as políticas do banco (RLS).

Os módulos que vamos entregar nesta Primeira Parte (MVP de 1 mês) operam da seguinte forma:

#### Módulo A: Gestão Core (Multitenancy & Auth)

* **Objetivo:** Garantir que o sistema sabe quem é a igreja e quem é o administrador.
* **Endpoints autogerados:** `/rest/v1/tenants` e APIs do GoTrue `/auth/v1/...`

#### Módulo B: Gestão de Eventos (Eventos & Banners)

* **Objetivo:** CRUD de agenda da igreja.
* **Endpoints autogerados:** `/rest/v1/events` (GET, POST, PATCH, DELETE).
* **Filtros Nativos:** O frontend do site pedirá apenas os eventos futuros via *query params* autogerados, ex: `/rest/v1/events?date=gte.now()&tenant_id=eq.123`.

#### Módulo C: CMS / Site (Conteúdo Dinâmico)

* **Objetivo:** Permitir alterar os textos e imagens das secções do site sem mexer no código do Next.js.
* **Endpoints autogerados:** `/rest/v1/site_sections`.

---

### 3. Modelo de Dados Relacional (Esquema SQL Físico)

Este é o esquema técnico exato para implementar no PostgreSQL do Supabase.

| Tabela | Coluna | Tipo de Dado | Restrições (Constraints) & Notas |
| --- | --- | --- | --- |
| **`tenants`** | `id` | `UUID` | **PK**, `default uuid_generate_v4()` |
|  | `name` | `VARCHAR(255)` | `NOT NULL` (Ex: "Igreja Paraíso") |
|  | `slug` | `VARCHAR(100)` | `UNIQUE, NOT NULL` (Usado para a URL: `/igreja-paraiso`) |
| **`users`** | `id` | `UUID` | **PK**, **FK** para `auth.users` (Tabela interna do Supabase) |
|  | `tenant_id` | `UUID` | **FK** para `tenants.id`, `NOT NULL` |
|  | `role` | `VARCHAR(50)` | `DEFAULT 'admin'` |
| **`events`** | `id` | `UUID` | **PK**, `default uuid_generate_v4()` |
|  | `tenant_id` | `UUID` | **FK** para `tenants.id`, `NOT NULL` |
|  | `title` | `VARCHAR(255)` | `NOT NULL` |
|  | `date` | `TIMESTAMPTZ` | `NOT NULL` (Timestamp com fuso horário) |
|  | `description` | `TEXT` | Opcional |
|  | `banner_url` | `TEXT` | Opcional (URL do Supabase Storage) |
|  | `is_active` | `BOOLEAN` | `DEFAULT true` (Para poder ocultar sem apagar) |
| **`site_sections`** | `id` | `UUID` | **PK**, `default uuid_generate_v4()` |
|  | `tenant_id` | `UUID` | **FK** para `tenants.id`, `NOT NULL` |
|  | `section_key` | `VARCHAR(50)` | `NOT NULL` (Ex: `'hero_section'`, `'about_us'`) |
|  | `content` | `JSONB` | `NOT NULL` (Ex: `{"title": "Bem-vindo", "subtitle": "..."}`) |
|  | *Índice Único* | `UNIQUE` | `(tenant_id, section_key)` - Evita secções duplicadas por igreja |

---

### 4. Gestão de Risco: Top 3 Riscos Arquiteturais e Mitigações

Como teu Tech PM, analisando esta arquitetura, estes são os buracos onde o projeto pode afundar se não formos rigorosos:

| Risco Técnico | Impacto no Negócio | Estratégia de Mitigação |
| --- | --- | --- |
| **1. Vazamento de Dados via PostgREST** | Como a API do Supabase é exposta diretamente, um *fetch* malicioso no frontend poderia trazer eventos de TODAS as igrejas se o desenvolvedor apenas fizer `supabase.from('events').select('*')`. | **RLS Obrigatório.** A política SQL na tabela `events` deve ser: `CREATE POLICY "Isolar Tenants" ON events USING (tenant_id = auth.jwt()->>'tenant_id');` |
| **2. Excesso de Requisições (Next.js vs Supabase)** | Se o site público (Next.js) fizer uma query ao Supabase a cada acesso de visitante, os custos do banco de dados disparam e o site fica lento. | O Dev B (Next.js) **deve** usar o cache do Next.js. O painel Admin fará uma chamada a um *Webhook* do Next.js sempre que um evento for atualizado para invalidar o cache (On-Demand Revalidation). |
| **3. Esquema Rígido no CMS** | Criar muitas colunas específicas para o site (ex: `hero_title`, `about_text`) quebra a flexibilidade se a igreja quiser mudar o layout no futuro. | Uso do tipo `JSONB` na coluna `content` da tabela `site_sections`. Assim o admin envia um objeto JSON dinâmico que o Next.js interpreta, mantendo a tabela SQL limpa e genérica. |

