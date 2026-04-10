/**
 * Mascara CPF de 11 dígitos para exibição (ex.: ***.123.456-**).
 * Assume apenas dígitos, sem formatação.
 */
export function maskCpfDigits(cpf11: string): string {
  if (!/^\d{11}$/.test(cpf11)) {
    return '***.***.***-**';
  }
  return `***.${cpf11.slice(3, 6)}.${cpf11.slice(6, 9)}-**`;
}
