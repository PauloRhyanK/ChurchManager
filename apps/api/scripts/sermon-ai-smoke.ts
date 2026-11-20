/**
 * Confere a chave e TODOS os modelos configurados da IA da Palavra ("Colar texto") com um texto de exemplo embutido.
 *   Local:            npm run script:sermon-ai-smoke
 *   QA/produção:      dentro do contêiner da API, node dist/tools/scripts/sermon-ai-smoke.js
 * Faz UMA chamada real por modelo (custa centavos). Não roda em teste nem no CI. Ver src/modules/sermons/ai/README.md.
 */
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_CLIENT_OPTIONS } from '../src/modules/sermons/ai/anthropic-client';
import { AnthropicStructurer } from '../src/modules/sermons/ai/anthropic-structurer';
import { describeSermonAiConfig, readSermonAiConfig } from '../src/modules/sermons/ai/sermon-ai.config';
import { SummarizerError } from '../src/modules/sermons/ai/sermon-summarizer';
import { pastedLines } from '../src/modules/sermons/sermon-outline';

const SAMPLE = [
  'A luz do mundo',
  'Eu sou a luz do mundo; quem me segue não andará em trevas. João 8:12',
  '1. A luz chama',
  'Antes de a gente procurar, a luz já estava acesa.',
  '2. A luz mostra',
  'Lâmpada para os meus pés é a tua palavra, e luz para o meu caminho. Salmos 119:105',
].join('\n');

async function main() {
  const config = readSermonAiConfig(process.env);
  for (const line of describeSermonAiConfig(process.env)) console.log(line);
  if (!config.enabled) {
    console.error(
      [
        'A IA da Palavra (Colar texto) está desligada.',
        'Defina ANTHROPIC_API_KEY no ambiente do servidor (arquivo .env, nunca no Git).',
        'Opcionais: SERMON_AI_MODELS (ex.: anthropic:claude-opus-5-5) e SERMON_AI_EFFORT (low, medium ou high).',
      ].join('\n'),
    );
    process.exit(1);
  }
  const lines = pastedLines(SAMPLE);
  const structurer = new AnthropicStructurer(new Anthropic(ANTHROPIC_CLIENT_OPTIONS));
  let failed = 0;
  for (const option of config.models) {
    console.log(`\nModelo: ${option.label} (${option.model}), esforço ${config.effort}. Linhas enviadas: ${lines.length}.`);
    try {
      const out = await structurer.structure({ lines, model: option.model, effort: config.effort });
      console.log(`Título: ${out.title}`);
      for (const b of out.blocks) {
        console.log(`- ${b.kind} [${b.start}–${b.end}]${b.text ? ` ${b.text}` : ''}${b.reference ? ` (${b.reference})` : ''}`);
      }
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
