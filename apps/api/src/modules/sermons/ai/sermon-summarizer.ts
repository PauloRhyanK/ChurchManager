// Interface neutra de provedor para resumir as partes do sermão em "Slides completos".
import type { SummaryTarget } from '../sermon-slides';

export type SummarizeInput = { title: string; targets: SummaryTarget[]; model: string; effort: 'low' | 'medium' | 'high' };

export interface SermonSummarizer {
  summarize(input: SummarizeInput): Promise<{ id: string; text: string }[]>;
}

/** Falha do provedor já classificada. A mensagem nunca leva a chave nem o corpo do pedido. */
export class SummarizerError extends Error {
  constructor(
    readonly reason: 'UNAVAILABLE' | 'AUTH' | 'RATE_LIMIT' | 'REFUSED' | 'TRUNCATED' | 'INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'SummarizerError';
  }
}

/** Token de injeção: Record<'anthropic', SermonSummarizer>. */
export const SUMMARIZERS = Symbol('SUMMARIZERS');
