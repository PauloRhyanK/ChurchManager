# IA dos "Slides completos"

O modo "Slides completos" resume com um modelo de linguagem as partes do sermão (Abertura, seções, Ilustração, Aplicação) em frases de até 90 caracteres para o telão.

## O que vai ao provedor

- O título da palavra e, para cada parte a resumir, um id, o tipo, o rótulo e o texto da parte.
- **Nunca**: blocos "Só para mim", versículos, dados da igreja ou do usuário, a chave de outros serviços.
- O conteúdo do sermão é tratado como dado, não como instrução (ver `SUMMARY_SYSTEM_PROMPT`).

## Variáveis (ambiente do servidor; nunca no Git nem no navegador)

| Variável | O que faz |
| --- | --- |
| `ANTHROPIC_API_KEY` | Chave do provedor. Sem ela o recurso fica desligado e a API sobe normalmente. |
| `SERMON_AI_MODELS` | Lista `provedor:modelo` separada por vírgulas. Padrão: `anthropic:claude-opus-5-5`. O primeiro é o padrão do painel. |
| `SERMON_AI_EFFORT` | `low` (padrão), `medium` ou `high`. |

## Acrescentar um modelo

Basta incluí-lo em `SERMON_AI_MODELS`, com o id exato do provedor e sem sufixo de data (ex.: `anthropic:claude-opus-5-5,anthropic:claude-sonnet-5-5`). Um rótulo amigável para ids novos fica em `LABELS` de `sermon-ai.config.ts`; sem ele, o próprio id aparece.

## Acrescentar outro provedor

1. Implemente `SermonSummarizer` (`sermon-summarizer.ts`), convertendo as falhas em `SummarizerError`.
2. Inclua o nome do provedor em `PROVIDERS` de `sermon-ai.config.ts`.
3. Registre-o em `SUMMARIZERS` em `sermons.module.ts`, criando o cliente só quando a configuração estiver ligada.

## Conferir a chave e os modelos

Resume um sermão de exemplo com **cada** modelo de `SERMON_AI_MODELS` e imprime as frases; para o modelo que falhar, imprime `reason`, `status`, `type` e o modelo (os mesmos campos do registro da API) e, no fim, sai com código 1. Sem chave, explica o que configurar e sai com código 1. Faz uma chamada real por modelo: não roda em teste nem no CI.

- **QA e produção** (dentro do contêiner da API, que já recebe as variáveis do ambiente):
  - produção: `docker compose -f docker-compose.prod.yml exec api node dist/tools/scripts/sermon-ai-smoke.js`
  - QA: `docker compose -f docker-compose.qa.yml exec qa-api node dist/tools/scripts/sermon-ai-smoke.js`
  A imagem de produção (`apps/api/Dockerfile`) traz só as dependências de produção e os scripts já compilados em `dist/tools/scripts/` (sem `tsx` nem o código-fonte). O `dotenv-cli` é devDependency e **não** está na imagem, por isso o `npm run script:sermon-ai-smoke` não funciona lá.
- **Local**: `cd apps/api && npm run script:sermon-ai-smoke` (lê o `.env` da raiz pelo `dotenv-cli`).

## Erros do provedor

A API responde ao painel com uma mensagem em português e registra só `reason`, `status` (HTTP), `type` (`error.type` da resposta) e o modelo. `CONFIG` (HTTP 400 ou 404 do provedor) quase sempre é um id de modelo errado em `SERMON_AI_MODELS`: o painel mostra "O modelo configurado não aceitou o pedido. Avise o administrador.".

O reencaminhamento no servidor em caso de recusa (`fallbacks: "default"`, header `server-side-fallback-2026-07-01`) só vai para modelos que o têm (ids que começam com `claude-opus-5`, `claude-fable-5`, `claude-mythos-5` ou `claude-sonnet-5-5`). Se um pedido com ele voltar 400, a API tenta uma vez sem ele.

## Tempo de resposta e proxy

O cliente do SDK espera até 45 s por resposta e não repete sozinho (`ANTHROPIC_CLIENT_OPTIONS`). O proxy reverso na frente da API (Nginx Proxy Manager ou outro) precisa permitir **pelo menos 60 s** de leitura para `POST /admin/tenants/me/sermons/:id/slides/generate`; com o padrão de 60 s do Nginx funciona, mas não reduza.

## Custo e limites

O custo depende do modelo escolhido; consulte a tabela de preços do provedor em https://www.anthropic.com/pricing. Cada usuário pode gerar 10 vezes por hora (em memória, por processo); partes curtas demais não são enviadas, e uma palavra sem partes a resumir não chama o modelo.
