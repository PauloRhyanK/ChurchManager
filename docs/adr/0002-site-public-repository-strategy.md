# ADR 0002 — Estratégia do repositório do site público (Next.js)

## Estado

Aceite (revisto).

## Contexto

O site público (SSR/SSG) consome a API Nest.js em **modo leitura** (e rotas públicas acordadas). As opções são:

- **Repositório separado** (ex.: `igreja-paraiso` noutro clone) — isolamento por projecto, permissões e ciclos de release independentes.
- **Pasta opcional no monorepo** (ex.: `apps/site-public`) — útil como **site de referência** ou **starter** durante o desenvolvimento interno da equipa.

A regra técnica mantém-se: **sem partilha de pacotes** entre aplicações — cada repo/pasta com o seu `package.json`; nada de `@shared/types` ou workspaces de tipos comuns.

Para **comercializar o CMS**, o produto vendido é sobretudo a **API + painel admin** (e o contrato multitenant). Cada igreja ou parceiro pode ter um **site com tema, deploy e roadmap próprios**; esse front **não precisa** (e frequentemente **não deve**) viver no mesmo repositório que o núcleo do produto. O acoplamento correcto é **HTTP** + **OpenAPI** + variáveis de ambiente (`NEXT_PUBLIC_API_URL` ou equivalente), não a localização no Git.

## Decisão

1. Tratar o **repositório principal deste monorepo** como focado em **`apps/api`** e **`apps/admin`** (nomes exemplificativos). O site público de cada cliente **não** é obrigatório aqui.
2. Os **sites das igrejas** (incluindo o caso `igreja-paraiso`) ficam em **repositórios separados**, como consumidores da API do CMS; cada um evolui à parte (branding, SLA, customizações).
3. Uma pasta **`apps/site-public`** no monorepo é **opcional**: apenas como template interno, demonstração ou integração contínua de contrato — nunca como única forma de distribuir o front aos clientes.
4. Acoplamento entre qualquer site e a API **apenas** via **HTTP**, URL base configurável e contrato **OpenAPI**; nenhuma dependência de código partilhado entre repos.

## Consequências

- **Positivas:** Clientes e parceiros podem forkar ou criar o seu Next.js sem acesso ao repo do produto; o núcleo do SaaS permanece mais simples de licenciar e versionar.
- **Negativas:** É necessário documentar e versionar a API (OpenAPI) com rigor para evitar *drift* entre repos; CI pode validar o starter contra a API em *smoke tests* se existir `apps/site-public`.

## Referências

- [architecture.md](../architecture.md)
