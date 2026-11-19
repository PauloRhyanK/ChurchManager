// Interface neutra de provedor para resumir as partes do sermão em "Slides completos".
import type { SummaryTarget } from '../sermon-slides';

export type SummarizeInput = { title: string; targets: SummaryTarget[]; model: string; effort: 'low' | 'medium' | 'high' };

export interface SermonSummarizer {
  summarize(input: SummarizeInput): Promise<{ id: string; text: string }[]>;
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
