// Limite de chamadas à IA por usuário ("Colar texto", ajuste de tempos do culto): janela deslizante em memória.

export class GenerationLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max = 10,
    private readonly windowMs = 3_600_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Registra uma geração e devolve true; devolve false (sem contar) quando o usuário já usou o limite da janela. */
  take(userId: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(userId) ?? []).filter((h) => t - h < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(userId, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(userId, recent);
    return true;
  }
}
