# Church Manager

SaaS multitenant para gestão de igrejas: **API Nest.js** (PostgreSQL), **painel administrativo** (React + Vite) e **site público** (Next.js), em monorepo **isolado** — cada aplicação com o seu próprio `package.json`, sem dependências cruzadas entre projetos.

## Documentação

- **[Arquitectura canónica](docs/architecture.md)** — visão técnica, módulos, multitenancy, contratos OpenAPI, roadmap em fases.
- **[Domínio financeiro: esquema e webhooks](docs/financial-schema-and-webhooks.md)** — tabelas `financial_*`, fluxo Asaas e idempotência.
- **[ADRs](docs/adr/)** — decisões registadas (ex.: transição da visão Supabase, localização do site).

## Repositório

Este repositório está preparado para pastas do tipo `apps/api`, `apps/admin`, `apps/site-public` (nomes exemplificativos), com deploy independente por aplicação.

## Licença

Ver [LICENSE](LICENSE).
