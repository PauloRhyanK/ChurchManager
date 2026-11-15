/**
 * Mascara e-mail para exibição pública: 2 primeiras letras + `***` + `@domínio`
 * (ex.: `paulo@gmail.com` → `pa***@gmail.com`). Devolve `null` se vazio ou inválido.
 */
export function maskEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim() ?? '';
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) {
    return null;
  }
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  return `${local.slice(0, 2).toLowerCase()}***@${domain}`;
}
