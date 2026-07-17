const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verdadeiro quando o valor é um UUID válido (formato da coluna `id @db.Uuid`). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Filtro que resolve um ingresso por `publicCode` (QR) ou `id`. O `id` só entra
 * na consulta quando o valor é um UUID válido — caso contrário o Postgres lança
 * erro ao converter o código do QR para a coluna `id @db.Uuid`.
 */
export function ticketMatch(tenantId: string, codeOrId: string) {
  const value = codeOrId.trim();
  return {
    tenantId,
    OR: isUuid(value)
      ? [{ publicCode: value }, { id: value }]
      : [{ publicCode: value }],
  };
}
