/** Monta URLs de onboarding do painel a partir do ADMIN_WEB_BASE_URL. */
export function buildOnboardingUrl(
  base: string | undefined,
  path: string,
): string {
  const normalized = (base?.trim() || 'http://localhost:5173').replace(
    /\/$/,
    '',
  );
  return `${normalized}${path}`;
}
