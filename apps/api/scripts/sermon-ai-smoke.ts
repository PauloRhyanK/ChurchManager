/**
 * Confere a chave e TODOS os modelos configurados da IA dos "Slides completos" com um sermão de exemplo embutido.
 *   Local:            npm run script:sermon-ai-smoke
 *   QA/produção:      dentro do contêiner da API, node dist/tools/scripts/sermon-ai-smoke.js
 * Faz UMA chamada real por modelo (custa centavos). Não roda em teste nem no CI. Ver src/modules/sermons/ai/README.md.
 */
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_CLIENT_OPTIONS, AnthropicSummarizer } from '../src/modules/sermons/ai/anthropic-summarizer';
import { describeSermonAiConfig, readSermonAiConfig } from '../src/modules/sermons/ai/sermon-ai.config';
import { SummarizerError } from '../src/modules/sermons/ai/sermon-summarizer';
import { EXAMPLE_DOC } from '../src/modules/sermons/sermon-example';
import { cleanSummaries, summaryTargets } from '../src/modules/sermons/sermon-slides';

async function main() {
  const config = readSermonAiConfig(process.env);
  for (const line of describeSermonAiConfig(process.env)) console.log(line);
  if (!config.enabled) {
    console.error(
      [
        'A IA dos slides completos está desligada.',
        'Defina ANTHROPIC_API_KEY no ambiente do servidor (arquivo .env, nunca no Git).',
        'Opcionais: SERMON_AI_MODELS (ex.: anthropic:claude-opus-5-5) e SERMON_AI_EFFORT (low, medium ou high).',
      ].join('\n'),
    );
    process.exit(1);
  }
  const targets = summaryTargets(EXAMPLE_DOC);
  const summarizer = new AnthropicSummarizer(new Anthropic(ANTHROPIC_CLIENT_OPTIONS));
  let failed = 0;
  for (const option of config.models) {
    console.log(`\nModelo: ${option.label} (${option.model}), esforço ${config.effort}. Partes enviadas: ${targets.length}.`);
    try {
      const raw = await summarizer.summarize({ title: 'Luz', targets, model: option.model, effort: config.effort });
      const summaries = cleanSummaries(targets, raw);
      for (const t of targets) console.log(`- ${t.label}: ${summaries[t.id] ?? '(sem resumo)'}`);
    } catch (err) {
      failed++;
      // Os mesmos quatro campos do registro da API: nada do pedido, da resposta nem da chave.
      if (err instanceof SummarizerError) {
        console.error(`Falhou: reason=${err.reason} status=${err.status ?? '-'} type=${err.type ?? '-'} model=${option.model}`);
      } else {
        console.error(`Falhou: ${err instanceof Error ? err.name : 'erro desconhecido'} model=${option.model}`);
      }
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} de ${config.models.length} modelo(s) falharam.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Falhou: ${err instanceof Error ? err.name : 'erro desconhecido'}`);
  process.exit(1);
});
