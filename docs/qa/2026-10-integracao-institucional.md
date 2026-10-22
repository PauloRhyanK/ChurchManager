# QA — integração institucional ChurchManager ↔ Site (CHURCH-d020, plano pl-a788)

**Estado global: PARCIAL / BLOQUEADO.** Os gates estão verdes, mas a etapa CHURCH-20a3 **não está na qa testada**, então os critérios 8 e 9 do plano não são atendidos. Não declarar o plano concluído antes de integrar a CHURCH-20a3 e repetir esta verificação.

## SHA testado

`22e99c4c179c07c95a5716741a4d62e7d949e426` (`origin/qa` = branch de trabalho; `git merge origin/qa` → "Already up to date"). Diff revisado: `3af89d5..HEAD` (66 arquivos). Integradas: CHURCH-184d (#3), 934f (#4), eaa3 (#5), 1705 (#6), 48d6 (#7). **Ausente: CHURCH-20a3.**

Prova de que a 20a3 não está na qa:
- `site-content.service.ts` e `access/permissions.ts` não mudam desde `3af89d5` (`git log 3af89d5..HEAD` vazio para ambos).
- `migrateLegacyData` (`site-content.service.ts:243-342`) segue igual: roda em todo boot e, para ministries, executa `siteContent.delete` (≈ linha 313).
- Não há spec do endpoint público (`public-site-content.controller.ts` sem teste); `PERMISSION_MODULES` sem CHURCH.

## Gates (execução real, sobre o SHA acima)

**API** — `npm ci && npx prisma generate && npx tsc --noEmit -p tsconfig.json && npm test && npm run build`: exit 0.
```
TSC_OK
# tests 253   # pass 253   # fail 0   # skipped 0
nest build  → API_GATE_OK
```
**Admin** — `npm ci && npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run && npm run build`: exit 0.
```
TSC_OK
✖ 11 problems (0 errors, 11 warnings)  → LINT_OK (warnings tolerados pelo AGENTS.md)
Test Files 5 passed (5) | Tests 39 passed (39)
vite build ✓ built in 8.61s  → ADMIN_GATE_OK
```
Avisos de `npm ci` (deprecations) e do browserslist são ruído, não falhas.

## Critérios de aceite do plano

| # | Critério | Resultado | Evidência / motivo |
|---|---|---|---|
| 1 | Editar Filial/Pastor/Ministério/Horário responde 200 e recarrega o persistido | **Não verificável de ponta a ponta** | Sem Postgres. Coberto por `church-api.test.ts` (PUT sem campos do servidor) e `church-dto-contract.spec.ts` ("corpo do painel é aceito" por entidade). |
| 2 | Nenhum POST/PUT envia id/tenantId/createdAt/updatedAt; API segue recusando com 400 | **Atendido** (testes) | `church-api.test.ts` ("update → PUT com id só na URL…"); `church-dto-contract.spec.ts` ("id/tenantId/createdAt/updatedAt são recusados"). DTOs não ampliados. |
| 3 | GET falho → erro com "Tentar novamente", sem salvar formulário vazio | **Atendido** (testes) | `ChurchPage.test.tsx`: lista com erro, configuração com GET falho não renderiza formulário nem botão salvar. |
| 4 | Confirmação ao descartar alterações; sucesso só após OK | **Atendido** (testes) | `ChurchPage.test.tsx`: diálogo sujo, troca de aba, `beforeunload`. "Sucesso só após OK" não tem teste dedicado; verificado só por leitura do código, não por navegador. |
| 5 | CHURCH:VIEW sem botões de escrita | **Atendido** (testes) | `ChurchPage.test.tsx` ("com CHURCH:VIEW não há botões…"); API: `church-authorization.spec.ts` (403 nas escritas). |
| 6 | Upload JPEG/PNG/WebP/GIF ≤ 5 MB; recusa SVG/maior/falso; erro sem bucket/endpoint | **Atendido** (testes com S3 mockado); **R2 real não verificável** | `storage.service.spec.ts`, `image-upload.interceptor.spec.ts`, `ImageUploader.test.tsx`. Tipo detectado pelos bytes; `requestChecksumCalculation: WHEN_REQUIRED` aplicado, mas a hipótese dos checksums só se confirma no QA com credenciais reais. |
| 7 | Revalidação não derruba a API; segredo fora de query e de host do tenant | **Atendido** (testes) | `site-revalidation.service.ts:30-96` (catch em `run` e em `notifyContentChanged`; segredo no header `x-revalidation-secret`; destinos de `SITE_REVALIDATION_TARGETS`, não do CORS); `site-revalidation.service.spec.ts`, `.util.spec.ts`. |
| 8 | Reiniciar a API 2× não altera/apaga `site_content`, filiais, pastores, ministérios | **NÃO ATENDIDO** | CHURCH-20a3 ausente: `migrateLegacyData` ainda apaga a linha `ministries` e reescreve `churches`/`pastors` a cada boot. |
| 9 | GET público sem id/tenantId/timestamps/inativos e igual ao contrato, provado por teste | **NÃO ATENDIDO** (sem teste) | Sem spec do endpoint público na qa. Em `3af89d5` o diagnóstico apenas leu o código ("verificado sem problema"); isso não é prova por teste. `docs/api/site-content-contract.md` foi alterado (+14 linhas) mas não há teste que o confronte. |
| 10 | Gates verdes na qa com relatório commitado | **Atendido** | Seção acima; este arquivo. |

### Passos 4–5c da tarefa
- **Regressão (Eventos, Acesso/Usuários, Config. financeiras, Gestão do Site):** as suítes existentes passam (API 253/253, admin 39/39). Navegação no navegador **não executada** (ver abaixo). Alterações no diff que tocam esses fluxos: upload de capa de eventos passa a usar o mesmo `uploadImage` (limite 5 MB / sem SVG) em `tenants-me-events.controller.ts:136`; `events-isolation.spec.ts` ajustado.
- **Fluxo no navegador com Playwright (passo 5): NÃO EXECUTADO.** O ambiente não tem Postgres (`psql/postgres` ausentes; sem `DATABASE_URL`) nem Docker daemon. Portanto **não verificado**: CRUD de Filial/Pastor/Ministério/Horário, Ofertório & Redes salvar+recarregar, usuário VIEW no navegador, API derrubada, screenshots 1280/375 px, `GET /api/public/tenants/demo/site-content` refletindo edições, editar e repor seção da Gestão do Site. Também sem R2 real.
- **Limites de atualização (5b):** revalidação disparada em church-config, filiais, pastores, ministérios, site-content (`site-content.service.ts:190,199`) e horários (`schedules.service.ts:39,67,80`; `schedules-revalidation.spec.ts`). O **TTL de 300 s é do site** (`revalidate: 300`, documentado em `docs/api/site-content-contract.md:190,233`); neste repositório não há valor a testar. Não verificável aqui; confirmar no repositório do site.
- **Roteiro E2E (5c) — casos cobertos por testes deste repositório (somente lado API/painel):** 2 (parcial: PUT sem campos do servidor), 6 (parcial: horário revalida), 10 (parcial: sem destino → sem chamada, sem erro), 12 (403 para VIEW na API), 13 (SVG recusado, >5 MB → 413, PNG por assinatura de bytes), 14 (outro tenant → 404 em `church-isolation.spec.ts`). Nenhum caso é coberto no lado do site. Casos 1, 3, 4, 5, 7, 8, 9, 11 não têm cobertura aqui.

## Revisão de segurança (diff `3af89d5..HEAD`)

Revisão manual; a skill `security-review` não foi executada. Nenhum achado **alto** novo no diff.

| Item | Resultado |
|---|---|
| Isolamento por tenant | OK. Leituras/escritas de `branches|pastors|ministries.service.ts` usam `findOne(id, tenantId)` (`where: {id, tenantId}`, linhas 26-27) antes do `update/delete where {id}` (linhas 48-59, check-then-write; sem janela explorável por outro tenant, pois o id já foi validado). `church-isolation.spec.ts` prova 404. Tenant vem do JWT. |
| Campos controlados pelo servidor | OK. DTOs não aceitam id/tenantId/createdAt/updatedAt (teste). |
| Upload | OK. 5 MB (multer + service), detecção por bytes (`storage.service.ts:21-39`), SVG recusado, ContentType e extensão vindos do tipo detectado, chave `uuid`, mensagens em pt-BR sem detalhes (`:84-94`), configuração conferida antes do envio. |
| Revalidação | OK. Segredo só em header, nunca em URL nem em log (`formatFetchError` não inclui segredo); destinos só de `SITE_REVALIDATION_TARGETS`; https obrigatório em produção; credenciais na URL recusadas; timeout 5 s. |
| Links `javascript:` | Church: OK, `IsHttpUrl` só http/https (`dto/field-decorators.ts:45-50`, teste "só http/https"). Site-content: `URL_RE` (`site-content.validation.ts:9`) recusa `javascript:`. |
| Segredos commitados | Nenhum no diff (varredura por atribuições de secret/password/token/key; `.env.example`/`.env.qa.example` só com nomes e valores vazios). |

Achados menores (baixos, não corrigidos — fora do escopo):
1. `site-content.validation.ts:9`: `/\S*` aceita URL protocolo-relativa `//host` (vira link externo). Só editável por quem tem SITE:EDIT; baixo.
2. `events.service.ts:215` ainda chama `deleteFileByPublicUrl` (pré-existente em eventos); a regra "preservar arquivos" do plano vale para o módulo Igreja/Site, que não exclui. Registrar para decisão.
3. Pré-existente: `migrateLegacyData` com `delete` de dados (critério 8).

## Pendências

- **Bloqueio:** integrar CHURCH-20a3 na qa e repetir esta verificação (critérios 8 e 9 e, com ela, `PERMISSION_MODULES` com CHURCH). Não implementei a 20a3 aqui para não duplicar/conflitar com o PR dela.
- Verificação com Postgres + navegador (passo 5) e screenshots 1280/375 px: a executar em ambiente com banco.
- Prova com R2 real no QA (upload; confirmar ou descartar a hipótese dos checksums pelo log da API).
- Órfãos no R2: imagens substituídas/excluídas ficam preservadas por decisão do plano; sem rotina de limpeza.
- Configurar nos ambientes: `SITE_REVALIDATION_SECRET`, `SITE_REVALIDATION_TARGETS` (JSON `{"<slug>":["https://site"]}`), variáveis `R2_*` (`R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`). Sem `SITE_REVALIDATION_TARGETS` a revalidação fica desligada e o site atualiza em até 300 s.
- Ordem de deploy com o site: o site aceita o segredo no header (e, na transição, na query) antes ou junto da API; a API só deve publicar a revalidação nova com `SITE_REVALIDATION_TARGETS` configurada. Validação conjunta: `docs/integracao-institucional/roteiro-e2e.md`, fora do Warren.
