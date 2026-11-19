# IA da Palavra ("Colar texto")

O "Colar texto" usa um modelo de linguagem para organizar o texto que o pregador colou no formato do esboço: o modelo lê as linhas numeradas e diz só onde começa e termina cada parte (título de seção, ponto, versículo, ilustração, aplicação, lista, parágrafo). O texto em si sai das linhas coladas, no servidor (`anthropic-structurer.ts`, `sermon-outline.ts`).

Os slides **não** usam IA: o gerador (`sermon-slides.ts`) monta um slide por tópico a partir do esboço, seguindo `docs/identidade-slides.md`.

## O que vai ao provedor

- As linhas do texto colado, numeradas. A resposta não tem campo para o texto do sermão nem para texto bíblico: só tipos, números de linha, títulos e referências.
- **Nunca**: dados da igreja ou do usuário, a chave de outros serviços.
- O conteúdo do sermão é tratado como dado, não como instrução (ver `STRUCTURE_SYSTEM_PROMPT`).

## Variáveis (ambiente do servidor; nunca no Git nem no navegador)

| Variável | O que faz |
| --- | --- |
| `ANTHROPIC_API_KEY` | Chave do provedor. Sem ela o recurso fica desligado e a API sobe normalmente. |
| `SERMON_AI_MODELS` | Lista `provedor:modelo` separada por vírgulas. Padrão: `anthropic:claude-opus-5-5`. O primeiro é o padrão do painel. |
| `SERMON_AI_EFFORT` | `low` (padrão), `medium` ou `high`. |

## Acrescentar um modelo

Basta incluí-lo em `SERMON_AI_MODELS`, com o id exato do provedor e sem sufixo de data (ex.: `anthropic:claude-opus-5-5,anthropic:claude-sonnet-5-5`). Um rótulo amigável para ids novos fica em `LABELS` de `sermon-ai.config.ts`; sem ele, o próprio id aparece.

## Acrescentar outro provedor

1. Implemente `SermonStructurer` (`sermon-structurer.ts`), convertendo as falhas em `SummarizerError` (`sermon-summarizer.ts`).
2. Inclua o nome do provedor em `PROVIDERS` de `sermon-ai.config.ts`.
3. Registre-o em `STRUCTURERS` em `sermons.module.ts`, criando o cliente só quando a configuração estiver ligada.

## Conferir a chave e os modelos

Organiza um texto de exemplo com **cada** modelo de `SERMON_AI_MODELS` e imprime o título e as partes que o modelo encontrou; para o modelo que falhar, imprime `reason`, `status`, `type` e o modelo (os mesmos campos do registro da API) e, no fim, sai com código 1. Sem chave, explica o que configurar e sai com código 1. Faz uma chamada real por modelo: não roda em teste nem no CI.

- **QA e produção** (dentro do contêiner da API, que já recebe as variáveis do ambiente):
  - produção: `docker compose -f docker-compose.prod.yml exec api npx tsx scripts/sermon-ai-smoke.ts`
  - QA: `docker compose -f docker-compose.qa.yml exec qa-api npx tsx scripts/sermon-ai-smoke.ts`
  A imagem de produção (`apps/api/Dockerfile`) instala só as dependências de produção (`npm ci --omit=dev`) e depois `prisma` e `tsx` à parte; copia `scripts/` e `src/`. O `dotenv-cli` é devDependency e **não** está na imagem, por isso o `npm run script:sermon-ai-smoke` não funciona lá.
- **Local**: `cd apps/api && npm run script:sermon-ai-smoke` (lê o `.env` da raiz pelo `dotenv-cli`).

## Erros do provedor

A API responde ao painel com uma mensagem em português e registra só `reason`, `status` (HTTP), `type` (`error.type` da resposta) e o modelo. `CONFIG` (HTTP 400 ou 404 do provedor) quase sempre é um id de modelo errado em `SERMON_AI_MODELS`: o painel mostra "O modelo configurado não aceitou o pedido. Avise o administrador.".

O reencaminhamento no servidor em caso de recusa (`fallbacks: "default"`, header `server-side-fallback-2026-07-01`) só vai para modelos que o têm (ids que começam com `claude-opus-5`, `claude-fable-5`, `claude-mythos-5` ou `claude-sonnet-5-5`). Se um pedido com ele voltar 400, a API tenta uma vez sem ele.

## Tempo de resposta e proxy

O cliente do SDK (`anthropic-client.ts`) espera até 45 s por resposta e não repete sozinho (`ANTHROPIC_CLIENT_OPTIONS`). O proxy reverso na frente da API (Nginx Proxy Manager ou outro) precisa permitir **pelo menos 60 s** de leitura para `POST /admin/tenants/me/sermons/from-text`; com o padrão de 60 s do Nginx funciona, mas não reduza.

## Custo e limites

O custo depende do modelo escolhido; consulte a tabela de preços do provedor em https://www.anthropic.com/pricing. Cada usuário pode organizar textos 10 vezes por hora (em memória, por processo), com até 1.500 linhas por vez.
