// Cliente do SDK oficial da Anthropic usado pela IA da Palavra ("Colar texto"): uma chamada, sem streaming,
// com saída estruturada. Erros do SDK saem já classificados em SummarizerError. Também usado pelo ajuste de tempos do culto.
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages';
import { SummarizerError } from './sermon-summarizer';

/** O pedaço do cliente do SDK que usamos; o teste injeta um falso. */
export type AnthropicMessagesClient = {
  beta: { messages: { create(params: MessageCreateParamsNonStreaming): Promise<BetaMessage> } };
};

/**
 * Cliente do SDK: uma tentativa de até 45 s, para a resposta caber nos 60 s de leitura do proxy na frente da API
 * (ver README). Sem novas tentativas automáticas: o pregador decide se gera de novo.
 */
export const ANTHROPIC_CLIENT_OPTIONS = { timeout: 45_000, maxRetries: 0 } as const;

/** Modelos com reencaminhamento no servidor (`fallbacks`); os outros recebem o pedido sem `betas`/`fallbacks`. */
const FALLBACK_MODEL_PREFIXES = ['claude-opus-5', 'claude-fable-5', 'claude-mythos-5', 'claude-sonnet-5-5'];
export const supportsServerFallback = (model: string) => FALLBACK_MODEL_PREFIXES.some((p) => model.startsWith(p));

/**
 * Classifica um erro do SDK pela cadeia de classes, da mais específica para a mais geral. Outro erro passa adiante.
 * Do erro do SDK só se guardam `status` e `error.type`; a mensagem do provedor e os cabeçalhos ficam de fora.
 */
export function toSummarizerError(error: unknown): unknown {
  if (!(error instanceof Anthropic.AnthropicError)) return error;
  if (!(error instanceof Anthropic.APIError) || error instanceof Anthropic.APIConnectionError) {
    return new SummarizerError('UNAVAILABLE', 'Não foi possível falar com o provedor de IA.');
  }
  const info = {
    ...(typeof error.status === 'number' ? { status: error.status } : {}),
    ...(typeof error.type === 'string' ? { type: error.type } : {}),
  };
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new SummarizerError('AUTH', 'O provedor de IA recusou a credencial configurada.', info);
  }
  if (error instanceof Anthropic.RateLimitError) return new SummarizerError('RATE_LIMIT', 'O provedor de IA está no limite de uso.', info);
  if (error.status === 400 || error.status === 404) {
    return new SummarizerError('CONFIG', 'O provedor de IA não aceitou o pedido para o modelo configurado.', info);
  }
  return new SummarizerError('UNAVAILABLE', 'O provedor de IA respondeu com erro.', info);
}

/** O JSON que o último modelo escreveu, já conferido quanto a recusa e corte. Formato inválido vira INVALID. */
export function readResponseJson(response: BetaMessage): unknown {
  if (response.stop_reason === 'refusal') throw new SummarizerError('REFUSED', 'O provedor de IA se recusou a processar este texto.');
  if (response.stop_reason === 'max_tokens') throw new SummarizerError('TRUNCATED', 'A resposta do provedor de IA veio cortada.');
  // Depois de um reencaminhamento (bloco "fallback"), só vale o que o último modelo escreveu.
  const lastFallback = response.content.map((b) => b.type).lastIndexOf('fallback');
  const text = response.content
    .slice(lastFallback + 1)
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new SummarizerError('INVALID', 'A resposta do provedor de IA veio fora do formato.');
  }
}

/**
 * Uma chamada ao provedor. Modelos com reencaminhamento no servidor recebem `fallbacks`; um 400 com ele faz uma
 * nova tentativa sem. Erro do SDK sai já classificado (SummarizerError).
 */
export async function createMessage(client: AnthropicMessagesClient, base: MessageCreateParamsNonStreaming): Promise<BetaMessage> {
  try {
    if (!supportsServerFallback(base.model)) return await client.beta.messages.create(base);
    try {
      return await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    } catch (error) {
      // 400 com fallbacks: talvez o modelo ou a conta não aceite o reencaminhamento. Uma vez, sem ele.
      if (!(error instanceof Anthropic.APIError) || error.status !== 400) throw error;
      return await client.beta.messages.create(base);
    }
  } catch (error) {
    throw toSummarizerError(error);
  }
}
