// Interface neutra de provedor para os "Slides completos": o modelo de cada slide e as frases/subtítulos.
import type { AiTarget } from '../sermon-slides';

export type SummarizeInput = { title: string; targets: AiTarget[]; model: string; effort: 'low' | 'medium' | 'high' };

/** Uma decisão por alvo: `model` é '01'–'04' e `text` a frase ou subtítulo ('' quando o modelo não tem). */
export type SummarizeOutput = { id: string; model: string; text: string }[];

export interface SermonSummarizer {
  summarize(input: SummarizeInput): Promise<SummarizeOutput>;
}

/**
 * Falha do provedor já classificada. A mensagem nunca leva a chave nem o corpo do pedido.
 * `status` e `type` (HTTP e `error.type` do corpo da resposta) servem para diagnóstico; nunca a mensagem do provedor.
 * CONFIG = o provedor recusou o pedido como montado (HTTP 400/404): modelo ou parâmetro que não existe para ele.
 */
export class SummarizerError extends Error {
  readonly status?: number;
  readonly type?: string;

  constructor(
    readonly reason: 'UNAVAILABLE' | 'AUTH' | 'RATE_LIMIT' | 'REFUSED' | 'TRUNCATED' | 'INVALID' | 'CONFIG',
    message: string,
    info: { status?: number; type?: string } = {},
  ) {
    super(message);
    this.name = 'SummarizerError';
    if (info.status !== undefined) this.status = info.status;
    if (info.type !== undefined) this.type = info.type;
  }
}

/** Token de injeção: Record<'anthropic', SermonSummarizer>. */
export const SUMMARIZERS = Symbol('SUMMARIZERS');
