export interface BootstrapEnv {
  /** Nº de proxies confiáveis para o `trust proxy` do Express (0 = desligado). */
  trustProxyHops: number;
  /** Erros de configuração para logar no arranque (a API sobe mesmo assim). */
  warnings: string[];
}

/** Lê as variáveis usadas em `main.ts`, sem lançar: o que estiver errado vira aviso. */
export function readBootstrapEnv(
  env: Record<string, string | undefined>,
): BootstrapEnv {
  const warnings: string[] = [];

  const rawHops = env.TRUST_PROXY_HOPS;
  const hops = Number(rawHops?.trim() || 0);
  let trustProxyHops = 0;
  if (Number.isInteger(hops) && hops > 0) {
    trustProxyHops = hops;
  } else if (hops !== 0) {
    warnings.push(
      `TRUST_PROXY_HOPS inválido ("${rawHops}"): use um inteiro >= 0. Trust proxy desligado; o rate limit conta o IP do proxy.`,
    );
  }

  if (
    env.NODE_ENV === 'production' &&
    !env.PUBLIC_PARTICIPANT_API_SECRET?.trim()
  ) {
    warnings.push(
      'PUBLIC_PARTICIPANT_API_SECRET ausente em produção: /registrations/check e /registrations/mine respondem 401 a todos os pedidos.',
    );
  }

  return { trustProxyHops, warnings };
}
