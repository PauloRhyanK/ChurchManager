// Falha do provedor de IA já classificada, usada pela IA da Palavra ("Colar texto") e pelo ajuste de tempos do culto.

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
