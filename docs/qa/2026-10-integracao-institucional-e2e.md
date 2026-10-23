# Roteiro ponta a ponta painel → API → site — resultados

> Execução de [roteiro-e2e.md](../integracao-institucional/roteiro-e2e.md) em 2026-10-23, fora do Warren.

## Ambiente

| Peça | Versão | Como |
|---|---|---|
| API + painel (ChurchManager) | `qa` `c401507` (inclui pl-a788 e o PR #13 de eventos) | Postgres 16 local, migrations aplicadas, seed `demo`; API na 3001 (`npm run dev`), painel na 8080 |
| Site (igreja-paraiso) | `NelsonBenedito/homologacao` `5525ba5` (inclui pl-5edb e eventos) | `npm run build && npm start` (modo produção, cache ativo) na 3000 |
| Revalidação | `SITE_REVALIDATION_TARGETS={"demo":["http://localhost:3000"]}` + segredo de teste nos dois lados | — |
| R2 | credenciais **de exemplo** (placeholder) | upload real não verificável aqui |

Painel testado com Playwright 1.64 (Chromium) contra as telas reais; API e site por HTTP.

## Casos

| # | Caso | Resultado | Evidência |
|---|---|---|---|
| 1 | Criar filial ativa | **Atendido** | API 201; a filial aparece em `/` e `/nossas-igrejas` ~3 s depois, via revalidação (log da API: `Revalidação site-content solicitada (http://localhost:3000, 200)`). Imagem: só com R2 real |
| 2 | Editar filial | **Atendido** | Pela tela: PUT 200, corpo sem `id/tenantId/createdAt/updatedAt`, valor persiste após recarregar, site mostra o novo e não o antigo. O PUT com o objeto do GET continua 400 (`property id should not exist…`) |
| 3 | Desativar filial | **Atendido** | Some de `/` e `/nossas-igrejas` na visita seguinte |
| 4 | Excluir filial | **Atendido** (sem R2) | Confirmação com o nome do item; DELETE 200; some da tela. Preservação do arquivo no R2 não verificável sem R2 real (o código não chama exclusão de arquivo) |
| 5 | Pastor e ministério | **Atendido** | Criar/editar/desativar/excluir pela tela; `/time-pastoral` reflete; ministério aparece no JSON público (o site não exibe a seção, por decisão do site) |
| 6 | Agenda Semanal | **Atendido** | Criar/editar/desativar pela tela e pela API; home e `/contato` refletem na visita seguinte |
| 7 | Contatos (Ofertório, Redes e Contatos) | **Atendido** | Salvar pela tela 200, persiste após recarregar; telefone, e-mail e endereço em `/contato` e no rodapé; link do Maps da sede em `/contato` |
| 8 | PIX/banco | **Atendido** | Chave nova aparece na home |
| 9 | Gestão do Site (editar e repor seção) | **Atendido** | Badge novo da missão aparece; repor volta ao padrão |
| 10 | Sem revalidação | **Atendido, com a ressalva do SWR** | Filial renomeada direto no banco (sem aviso ao site), sem nenhuma outra gravação no período: `/` e `/nossas-igrejas` seguem com o nome antigo e mostram o novo após **311 s** (consulta a cada 10 s). É o TTL de 300 s mais uma visita: no Next, a primeira visita após expirar ainda recebe a versão antiga e dispara a regeneração. O limite real é "300 s + a visita seguinte" |
| 11 | API fora | **Atendido** | Site: nenhuma filial, pastor ou horário; só textos de reserva (endereço, telefone e **chave PIX de reserva** — ver pendência). Painel: "Não foi possível carregar os dados / Não foi possível conectar ao servidor"; o formulário de configuração não é desenhado (sem botão salvar) |
| 12 | Usuário só com CHURCH:VIEW | **Atendido** | API: GET 200; POST/PUT/DELETE de filial, PUT de configuração e de seção → 403. Tela: sem botões de adicionar/editar/excluir/salvar |
| 13 | Upload | **Atendido** (validações) / **não verificável** (R2 real) | SVG → 400, >5 MB → 413, texto disfarçado de PNG → 400, mensagens pt-BR. PNG válido → 500 genérico, porque o R2 local é placeholder |
| 14 | Outro tenant | **Atendido** | Tenant A recebe 404 em GET/PUT/DELETE da filial do tenant B; filial de B intacta no banco e ausente do site de A |

Telas: `/igreja` legível em 1280 px e 375 px (abas quebram em duas linhas). Nenhum erro de console no painel durante os fluxos.

## Achados

1. **Limite de requisições do painel (médio, latente).** Todas as rotas autenticadas do painel caem no throttler `platform` (10/min **por rota e por IP**; `app.module.ts` + `@SkipThrottle({ links: true })` nos controllers). A 11ª chamada a `GET /admin/tenants/me/branches` no mesmo minuto recebe 429. Em produção `TRUST_PROXY_HOPS` não está definido, então todos os administradores compartilham o IP do proxy. Nenhum 429 nos logs do proxy de produção desde 28/09 (uso baixo), mas uma sessão de edição intensa atinge o limite. Já existia na `main`.
2. **429 mostrado como "Dados inválidos" (baixo).** `getApiErrorMessage` (`apps/admin/src/lib/api.ts`) não trata 429 e cai na mensagem genérica de validação.
3. **Log do R2 sem a mensagem do erro (baixo).** Falha de upload aparece no servidor só como `{"code":"TypeError"}`; para diagnosticar o R2 real no QA o log precisa da mensagem (sem segredos).
4. **Proxy de produção tenta um upstream que falha antes de acertar (infra).** Linhas `502, 200` no access log do Nginx Proxy Manager para `api.igrejaparaiso.com.br`: a resposta final é correta, mas cada requisição paga uma tentativa falha.
5. **Chave PIX de reserva no site** (`fallbacks.ts`): com a API fora, a home mostra `projeto@visaodofuturo.com.br` (TODO de confirmação da tesouraria). Decisão de produto pendente.

## Não verificado

- Upload e exibição de imagem com R2 real; hipótese dos checksums (`requestChecksumCalculation: WHEN_REQUIRED`) — fazer no QA com credenciais reais e ler o log da API.
- Variáveis nos ambientes reais: `SITE_REVALIDATION_TARGETS`, `SITE_REVALIDATION_SECRET` (API) e `REVALIDATION_SECRET`, `SITE_MEDIA_HOSTNAMES` (Vercel).
