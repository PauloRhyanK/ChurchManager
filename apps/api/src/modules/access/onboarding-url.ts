/** Resolve a base URL pública do painel admin para links de onboarding. */
export function resolveAdminWebBaseUrl(options: {
  adminWebBaseUrl?: string;
  adminCorsOrigin?: string;
  nodeEnv?: string;
}): string {
  const explicit = options.adminWebBaseUrl?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  const corsFirst = options.adminCorsOrigin
    ?.split(',')
    .map((part) => part.trim())
    .find(Boolean);
  if (corsFirst) {
    return corsFirst.replace(/\/$/, '');
  }

  const env = options.nodeEnv ?? process.env.NODE_ENV;
  if (env === 'production') {
    throw new Error(
      'ADMIN_WEB_BASE_URL (ou ADMIN_CORS_ORIGIN) é obrigatório em produção para montar URLs de convite/cadastro.',
    );
  }

  return 'http://localhost:5173';
}

/** Monta URLs de onboarding do painel a partir da base já resolvida. */
export function buildOnboardingUrl(base: string, path: string): string {
  const normalized = base.replace(/\/$/, '');
  return `${normalized}${path.startsWith('/') ? path : `/${path}`}`;
}
