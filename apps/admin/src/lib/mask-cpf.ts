/** Mascara CPF de 11 dígitos (fallback se a API enviar valor inesperado). */
export function maskCpfDigits(digits: string): string {
  const clean = digits.replace(/\D/g, '');
  if (clean.length !== 11) {
    return '***.***.***-**';
  }
  return `***.${clean.slice(3, 6)}.${clean.slice(6, 9)}-**`;
}
