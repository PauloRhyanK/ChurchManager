/**
 * Normaliza o valor lido de um QR code. O QR entregue ao participante pode
 * conter o `publicCode` cru ou uma URL de ingresso terminada nele — neste caso
 * extraímos o último segmento do caminho.
 */
export function normalizeScannedCode(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      return decodeURIComponent(segments[segments.length - 1]);
    }
  } catch {
    // não é URL — usa o valor cru
  }
  return value;
}
