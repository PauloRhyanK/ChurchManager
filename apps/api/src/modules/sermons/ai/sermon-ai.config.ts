// Configuração da IA da Palavra ("Colar texto"), lida do ambiente do servidor.
// A chave em si nunca sai daqui: só se ela existe.

export type AiModelOption = { id: string; provider: 'anthropic'; model: string; label: string }; // id = 'anthropic:claude-opus-5-5'
export type SermonAiConfig = { enabled: boolean; models: AiModelOption[]; effort: 'low' | 'medium' | 'high' };

/** Token de injeção da configuração (lida do ambiente na subida). */
export const SERMON_AI_CONFIG = Symbol('SERMON_AI_CONFIG');

const DEFAULT_MODELS = 'anthropic:claude-opus-5-5';
const PROVIDERS = ['anthropic'] as const;
const EFFORTS = ['low', 'medium', 'high'] as const;
const LABELS: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-haiku-5-5': 'Claude Haiku 5.5',
  'claude-fable-5-2': 'Claude Fable 5.2',
};

function parseModels(raw: string): { models: AiModelOption[]; ignored: string[] } {
  const models: AiModelOption[] = [];
  const ignored: string[] = [];
  for (const piece of raw.split(',')) {
    const entry = piece.trim();
    if (!entry) continue;
    const m = /^([a-z]+):([A-Za-z0-9._-]+)$/i.exec(entry);
    const provider = m?.[1].toLowerCase();
    if (!m || !provider || !(PROVIDERS as readonly string[]).includes(provider)) {
      ignored.push(entry);
      continue;
    }
    const id = `${provider}:${m[2]}`;
    if (models.some((o) => o.id === id)) continue;
    models.push({ id, provider: provider as AiModelOption['provider'], model: m[2], label: LABELS[m[2]] ?? m[2] });
  }
  return { models, ignored };
}

const modelList = (env: Record<string, string | undefined>) => env.SERMON_AI_MODELS?.trim() || DEFAULT_MODELS;

export function readSermonAiConfig(env: Record<string, string | undefined>): SermonAiConfig {
  const { models } = parseModels(modelList(env));
  const effort = (EFFORTS as readonly string[]).includes(env.SERMON_AI_EFFORT?.trim() ?? '')
    ? (env.SERMON_AI_EFFORT!.trim() as SermonAiConfig['effort'])
    : 'low';
  const hasKey = !!env.ANTHROPIC_API_KEY?.trim();
  return { enabled: hasKey && models.length > 0, models, effort };
}

/** Entradas de SERMON_AI_MODELS que não viraram modelo (provedor desconhecido ou formato errado), como foram escritas. */
export function ignoredSermonAiEntries(env: Record<string, string | undefined>): string[] {
  return parseModels(modelList(env)).ignored;
}

/** Linhas do registro na subida: se a IA está ligada, quantos modelos e o que foi ignorado. Nunca a chave. */
export function describeSermonAiConfig(env: Record<string, string | undefined>): string[] {
  const config = readSermonAiConfig(env);
  const ignored = ignoredSermonAiEntries(env);
  return [
    `IA da Palavra (Colar texto): ${config.enabled ? 'ligada' : 'desligada'}, ${config.models.length} modelo(s).`,
    ...(ignored.length > 0 ? [`SERMON_AI_MODELS: entradas ignoradas: ${ignored.join(', ')}`] : []),
  ];
}
