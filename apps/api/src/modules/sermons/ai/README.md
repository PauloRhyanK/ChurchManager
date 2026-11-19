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

## Conferir a chave

`cd apps/api && npm run script:sermon-ai-smoke` resume um sermão de exemplo com o primeiro modelo e imprime as frases. Sem chave, explica o que configurar e sai com código 1. Faz uma chamada real: não roda em teste nem no CI.

## Custo e limites

O custo depende do modelo escolhido; consulte a tabela de preços do provedor em https://www.anthropic.com/pricing. Cada usuário pode gerar 10 vezes por hora (em memória, por processo); partes curtas demais não são enviadas, e uma palavra sem partes a resumir não chama o modelo.
