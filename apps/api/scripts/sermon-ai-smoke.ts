/**
 * Confere a chave e o modelo da IA dos "Slides completos" com um sermão de exemplo embutido.
 *   npm run script:sermon-ai-smoke
 * Faz UMA chamada real ao provedor (custa centavos). Não roda em teste nem no CI. Ver src/modules/sermons/ai/README.md.
 */
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicSummarizer } from '../src/modules/sermons/ai/anthropic-summarizer';
import { readSermonAiConfig } from '../src/modules/sermons/ai/sermon-ai.config';
import { SummarizerError } from '../src/modules/sermons/ai/sermon-summarizer';
import { EXAMPLE_DOC } from '../src/modules/sermons/sermon-example';
import { cleanSummaries, summaryTargets } from '../src/modules/sermons/sermon-slides';

async function main() {
  const config = readSermonAiConfig(process.env);
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
  const option = config.models[0];
  const targets = summaryTargets(EXAMPLE_DOC);
  const summarizer = new AnthropicSummarizer(new Anthropic({ maxRetries: 1, timeout: 60_000 }));
  console.log(`Modelo: ${option.label} (${option.model}), esforço ${config.effort}. Partes enviadas: ${targets.length}.`);
  const raw = await summarizer.summarize({ title: 'Luz', targets, model: option.model, effort: config.effort });
  const summaries = cleanSummaries(targets, raw);
  for (const t of targets) console.log(`- ${t.label}: ${summaries[t.id] ?? '(sem resumo)'}`);
}

main().catch((err) => {
  // Só o tipo do erro: nada do pedido nem da chave.
  console.error(err instanceof SummarizerError ? `Falhou: ${err.reason}` : 'Falhou ao chamar o provedor.');
  process.exit(1);
});
