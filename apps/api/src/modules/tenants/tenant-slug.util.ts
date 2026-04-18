const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Normaliza para minúsculas e remove espaços nas pontas. */
export function normalizeTenantSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Slug URL-seguro: minúsculas, números e hífens; não começa/termina com hífen; max 100.
 */
export function assertTenantSlugValid(slug: string): void {
  if (slug.length < 2 || slug.length > 100) {
    throw new Error('O slug deve ter entre 2 e 100 caracteres.');
  }
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      'Slug inválido: use apenas letras minúsculas, números e hífens (sem começar ou terminar com hífen).',
    );
  }
}
