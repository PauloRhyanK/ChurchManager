# QA — Integração institucional ChurchManager ↔ Site (lado ChurchManager)

Seed CHURCH-d020 · plano pl-a788 · executado em 2026-10-22.

## Código testado

- `origin/qa` = `4a01fcd` (já integrava as tarefas 1–6; `git merge origin/qa` → "Already up to date").
- Diff acumulado revisado: `git diff 3af89d5..HEAD` (75 arquivos).
- Esta tarefa acrescenta uma correção de segurança (ver S1) sobre `4a01fcd`; os gates abaixo foram repetidos depois dela (API) — o admin não foi tocado.

## Gates

### API — `npm ci && npx prisma generate && npx tsc --noEmit -p tsconfig.json && npm test && npm run build`

Execução final (após a correção S1):

```
tsc --noEmit        → exit 0
npm test            → # tests 271 / # pass 271 / # fail 0 / # skipped 0
npm run build       → nest build, exit 0
```

(Antes da correção S1, sobre `4a01fcd` puro: 270 testes, 270 pass, 0 fail.)

### Admin — `npm ci && npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run && npm run build`

```
tsc --noEmit -p tsconfig.app.json → exit 0
npm run lint        → ✖ 11 problems (0 errors, 11 warnings)   [warnings tolerados pelo AGENTS.md]
npx vitest run      → Test Files 6 passed (6) · Tests 41 passed (41)
npm run build       → ✓ 2597 modules transformed · ✓ built in 7.83s, exit 0
```

## Critérios de aceite do plano

| # | Critério | Resultado | Evidência / motivo |
|---|---|---|---|
| 1 | Editar/salvar Filial, Pastor, Ministério, Horário → 200; recarregar mostra o persistido | **Parcial — não verificável no navegador** | Sem Postgres/Docker no ambiente. Coberto por testes: `church-dto-contract.spec.ts` ("corpo do painel é aceito" por entidade), `church-isolation.spec.ts` ("o próprio tenant consegue atualizar"), `church-api.test.ts` (corpo montado campo a campo). Recarga real não observada. |
| 2 | Nenhum PUT/POST envia id/tenantId/createdAt/updatedAt; API segue recusando com 400 | **Atendido (testes)** | `church-api.test.ts` ("update → PUT com id só na URL e sem campos do servidor"); `church-dto-contract.spec.ts` ("id/tenantId/createdAt/updatedAt são recusados") usando `VALIDATION_PIPE_OPTIONS` de `validation-options.ts`, o mesmo do `main.ts`. |
| 3 | GET falho → erro + "Tentar novamente", sem salvar formulário vazio | **Atendido (testes)** | `ChurchPage.test.tsx`: "GET falhando mostra erro com 'Tentar novamente'…" e "configuração com GET falhando não renderiza o formulário (nem o botão salvar)". |
| 4 | Fechar diálogo/trocar aba/sair com alterações pede confirmação; sucesso só após OK | **Atendido (testes)** | `ChurchPage.test.tsx`: "fechar diálogo sujo…", "trocar de aba…", "beforeunload…". Fluxo visual não executado (sem backend). |
| 5 | Só CHURCH:VIEW: sem botões de escrita | **Atendido (testes)** | Admin: `ChurchPage.test.tsx` "com CHURCH:VIEW não há botões de escrita…". API: `church-authorization.spec.ts` (403 nas escritas). |
| 6 | Upload: JPEG/PNG/WebP/GIF ≤ 5 MB; recusa SVG, maior, tipo falso; erro sem vazar bucket/endpoint/variável | **Atendido (testes); R2 real não verificável** | `storage.service.spec.ts` (6 testes: tipos aceitos com ContentType detectado, SVG 400, falso 400, >5 MB 413, config ausente sem PutObject, erro do SDK sem vazamento). `image-upload.interceptor.spec.ts` (413 pt-BR). Sem R2 real: hipótese dos checksums (`requestChecksumCalculation: WHEN_REQUIRED`) **não confirmada**. |
| 7 | Falha de banco/rede na revalidação não derruba a API; segredo nunca em query nem para host do tenant | **Atendido (testes)** | `site-revalidation.service.spec.ts`: header `x-revalidation-secret`, URL sem `?`, destinos só de `SITE_REVALIDATION_TARGETS`, falhas só logadas; `site-revalidation.util.spec.ts` (http só fora de produção, sem credenciais na URL). |
| 8 | Reiniciar a API 2× não altera/apaga site_content, filiais, pastores, ministérios | **Atendido (testes com mock de Prisma)** | `site-content.spec.ts`: "migração legada: …nunca altera site_content", "rodar duas vezes não muda nada", "tabela com dados não é tocada", "falha num tenant faz rollback dele". Não executado contra Postgres real. |
| 9 | GET público sem id/tenantId/timestamps/inativos; formato = docs/api/site-content-contract.md | **Atendido (testes)** | `site-content.spec.ts`: "contrato público: formato exato de cada seção", "não vaza id/tenantId/timestamps/sortOrder", "só itens ativos…". Chamada HTTP real a `/api/public/tenants/demo/site-content` **não feita** (sem Postgres). |
| 10 | Gates verdes + relatório commitado | **Atendido** | Seção "Gates" acima; este arquivo. |

## Itens 4–5c da tarefa

- **Regressão (Eventos, Acesso/Usuários, Config. financeiras, Gestão do Site):** apenas pela suíte existente, toda verde (API 271, admin 41). `permissions.spec.ts` cobre CHURCH em `PERMISSION_MODULES`; `site-authorization.spec.ts` cobre Gestão do Site; `events-isolation.spec.ts` e `schedules-revalidation.spec.ts` cobrem Eventos/Horários. **Navegação no navegador: não executada.**
- **Postgres + Playwright (/igreja, usuário VIEW, API derrubada, screenshots 1280/375, GET público ao vivo):** **NÃO EXECUTADO.** Motivo: não há `psql`/`postgres` instalado e o Docker daemon não está disponível (`failed to connect to the docker API`). Também não há credenciais R2. Nenhum screenshot foi produzido.
- **Gestão do Site (editar e repor seção, conferir GET público):** não executado ao vivo; reposição/edição cobertas em `site-content.spec.ts` e `SiteSectionSheet.test.tsx`.
- **5b Limites de atualização:** site-content e horários disparam revalidação (código: `site-content.service.ts:199,208`; `schedules.service.ts:39,67,80`; teste `schedules-revalidation.spec.ts`; filiais/pastores/ministérios/config também chamam `notifyContentChanged`). O **TTL de 300 s é do site** (outro repositório): aqui só consta como `next: { revalidate: 300, tags: ["site-content"] }` em `docs/api/site-content-contract.md:185` e em `diagnostico.md` §5 — **não verificável neste repositório**.
- **5c Casos do `roteiro-e2e.md` já cobertos por testes deste repositório (somente lado API/painel; o lado do site não):**
  - 2 (edição 200 sem campos do servidor), 5 (idem pastor/ministério): `church-dto-contract.spec.ts`, `church-api.test.ts`.
  - 6 (horário revalida): `schedules-revalidation.spec.ts`.
  - 9 (editar/repor seção): `site-content.spec.ts`.
  - 12 (VIEW → 403): `church-authorization.spec.ts`, `site-authorization.spec.ts`.
  - 13 (SVG, >5 MB, PNG renomeado): `storage.service.spec.ts`, `image-upload.interceptor.spec.ts`.
  - 14 (tenant B → 404): `church-isolation.spec.ts`.
  - 1, 3, 4, 7, 8, 10, 11: só parcialmente (contrato público e revalidação testados; efeito visível no site, tempos e preservação no R2 **não** cobertos). 4: o código não exclui arquivos do R2 ao remover filial (nenhum `deleteFileByPublicUrl` fora de `events.service.ts`).

## Revisão de segurança (`git diff 3af89d5..HEAD`)

Revisão manual (a skill `security-review` não foi usada).

- **Isolamento por tenant:** controllers usam `user.tenantId` do JWT (`church-config.controller.ts:35,41,53`, `tenants-me-site-content.controller.ts:67,74-95`). Leituras/criações filtram/gravam `tenantId`. Em `update`/`delete` de filial, pastor e ministério o `where` é só `{ id }` (`branches.service.ts:49,59`, `pastors.service.ts:48,58`, `ministries.service.ts:48,58`), mas sempre precedido de `getForTenant(tenantId, id)`, que dá 404 para outro tenant (provado por `church-isolation.spec.ts`). **Sem achado explorável**; observação **baixa**: o padrão em dois passos depende da chamada anterior; `schedules.service.ts:45,52,73,79` idem.
- **Campos controlados pelo servidor:** DTOs não foram ampliados; `forbidNonWhitelisted` mantido e centralizado em `validation-options.ts`. `enableImplicitConversion` continua ativo globalmente; o caso 'false'→true foi mitigado só nos DTOs de Igreja/Horário via `StrictBoolean` (`dto/field-decorators.ts:30`). **Baixo:** outros módulos continuam sujeitos à conversão implícita (fora do escopo).
- **Upload:** limite 5 MB (`image-upload.interceptor.ts:7`, `storage.service.ts:68`), tipo pelos bytes iniciais, SVG recusado, extensão/ContentType derivados do conteúdo (`storage.service.ts:71-85`), config verificada antes do envio, erro do SDK só no log (`:88-97`); chave `tenants/{tenantId}/...` com UUID. **Sem achado.** Observação **baixa**: o log de configuração ausente lista nomes de variáveis (só log, não vai ao cliente). Assinatura de bytes não garante imagem íntegra (não há reprocessamento) — aceitável para o escopo.
- **Revalidação:** segredo em header, nunca em URL/log (`site-revalidation.service.ts:274-277`); destinos só de `SITE_REVALIDATION_TARGETS` (plataforma), https obrigatório em produção, sem credenciais na URL (`site-revalidation.util.ts:305-332`); timeout de 5 s; nunca lança. 
  - **S1 (médio → corrigido nesta tarefa):** `fetch` seguiria redirecionamentos 3xx do destino enviando o header `x-revalidation-secret` ao host do redirect. Correção: `redirect: 'manual'` em `site-revalidation.service.ts:278`, com teste (`site-revalidation.service.spec.ts`, "não segue redirecionamento", escrito antes e visto falhar).
  - **Baixo:** destino configurado para IP interno (ex.: `https://10.0.0.1`) é aceito — a configuração é do operador da plataforma, não do tenant.
- **Links `javascript:`:** `IsHttpUrl` (http/https) nos DTOs de Igreja (`field-decorators.ts:43-48`) e validação de campos `url` das seções do site, testada com `javascript:alert(1)` (`site-content.spec.ts:178`). **Sem achado.** Dados antigos já gravados com URL inválida não são reescritos (só falham ao salvar de novo — por desenho).
- **Segredos commitados:** busca por atribuições de segredos no diff e `git ls-files | grep .env` → apenas `*.env.example`; o único literal é `'segredo-super-secreto'` em spec. **Sem achado.**

**Nenhum achado alto em aberto.**

## Pendências e riscos reais

1. **Verificação ponta a ponta no navegador não feita** (sem Postgres/Docker): fluxos de /igreja, estado de erro com API parada, VIEW, screenshots 1280/375, GET público ao vivo. Deve ser executada em ambiente com Postgres (`roteiro-e2e.md`). Por isso o estado geral deste relatório é **PARCIAL**, não CONCLUÍDO.
2. **Upload com R2 real no QA** e leitura do log para confirmar/descartar a hipótese de checksums.
3. **Órfãos no R2:** imagens substituídas ou de itens excluídos são preservadas por decisão do plano (nenhuma limpeza automática).
4. **Variáveis a configurar nos ambientes:** `SITE_REVALIDATION_SECRET`, `SITE_REVALIDATION_TARGETS` (JSON `{"<slug>":["https://…"]}`), `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL` (sem `R2_PUBLIC_URL` o upload agora responde 503 em vez de enviar).
5. **Ordem de deploy com o site:** o site deve aceitar o segredo no header `x-revalidation-secret` antes (ou junto) da API; se a API subir primeiro, a revalidação falha com segurança e o conteúdo atualiza em até 300 s. Em produção, só publicar com `SITE_REVALIDATION_TARGETS` definida.
6. **Validação conjunta com o site** (`roteiro-e2e.md`, resultados em `docs/qa/2026-10-integracao-institucional-e2e.md`) não foi feita aqui.
7. Textos em português de Portugal ainda existem em áreas não tocadas (decisão do plano: padronizar só o que foi tocado).

## Estado global: **PARCIAL**

Gates verdes e sem achado de segurança alto em aberto; verificação em navegador/Postgres/R2 real pendente por limitação do ambiente.
