# ADR 0002 — Site público Next.js em `apps/site-public` no monorepo

## Estado

Aceite.

## Contexto

O site público (SSR/SSG) consome a API Nest.js em **modo leitura** (e eventualmente rotas públicas acordadas). Duas opções eram consideradas:

- **Repositório ou pasta totalmente separada** (ex.: clone histórico em `igreja-paraiso`) — máximo isolamento organizacional.
- **Co-localização no mesmo monorepo** numa pasta dedicada — um único clone, CI/CD por aplicação, alinhamento de versões com a API.

A regra de negócio impõe **sem partilha de pacotes** entre apps: cada projeto com o seu `package.json`; nada de `@shared/types` ou workspace de bibliotecas comuns.

## Decisão

1. Colocar o site Next.js em **`apps/site-public`** (nome pode ser ajustado, mas mantém-se um único directório por app sob `apps/`).
2. **Build e deploy independentes** por aplicação (pipelines distintos ou jobs distintos no mesmo ficheiro de CI).
3. Acoplamento entre site e API **apenas** via **HTTP**, variáveis de ambiente (base URL da API) e contrato **OpenAPI** documentado; nenhuma dependência de código partilhado no monorepo.
4. Se no futuro a equipa preferir repo separado, a migração é sobretudo **mover a pasta** e apontar CI/CD; o contrato permanece a API REST.

## Consequências

- **Positivas:** Descoberta de código e documentação no mesmo repositório; versões da API e do site podem ser referenciadas juntas em commits quando necessário.
- **Negativas:** Disciplina necessária para não introduzir pacotes workspace partilhados; tamanho do clone aumenta com o tempo.

## Referências

- [architecture.md](../architecture.md)
