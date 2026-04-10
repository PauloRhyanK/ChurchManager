# Church Manager

SaaS multitenant para gestão de igrejas: **API Nest.js** (PostgreSQL) e **painel administrativo** (React + Vite) neste monorepo **isolado** (cada app com o seu `package.json`, sem dependências cruzadas). O **site público** (Next.js) que consome o CMS em leitura vive, em regra, em **repositório separado** por igreja ou parceiro — o acoplamento é a API HTTP (OpenAPI), não o Git.

## Documentação

- **[Arquitectura canónica](docs/architecture.md)** — visão técnica, módulos, multitenancy, contratos OpenAPI, roadmap em fases.
- **[Domínio financeiro: esquema e webhooks](docs/financial-schema-and-webhooks.md)** — tabelas `financial_*`, fluxo Asaas e idempotência.
- **[ADRs](docs/adr/)** — decisões registadas (ex.: transição da visão Supabase, estratégia do repo do site público).

## Repositório

Estrutura típica: `apps/api`, `apps/admin`. Uma pasta `apps/site-public` é **opcional** (starter interno). Os sites das igrejas em produção podem estar noutros clones, alinhados ao contrato da API documentado em Swagger/OpenAPI.

- **[apps/api](apps/api/README.md)** — API Nest.js (Asaas, pré-cadastro por CPF, webhooks, auth JWT para o painel).
- **[apps/admin](apps/admin/README.md)** — Painel React (Vite, Tailwind, login, financeiro, cotas).

## Licença

Ver [LICENSE](LICENSE).
