/** Normaliza CPF para 11 dígitos (apenas números). */
export function normalizeCpf(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) {
    throw new Error('CPF deve ter 11 dígitos');
  }
  return digits;
}

/** Valida dígitos verificadores do CPF brasileiro. */
export function isValidCpfDigits(cpf11: string): boolean {
  if (!/^\d{11}$/.test(cpf11)) return false;
  if (/^(\d)\1{10}$/.test(cpf11)) return false;

  const toCheck = (base: string, factor: number): number => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += parseInt(base[i]!, 10) * factor--;
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = toCheck(cpf11.slice(0, 9), 10);
  if (d1 !== parseInt(cpf11[9]!, 10)) return false;

  const d2 = toCheck(cpf11.slice(0, 10), 11);
  if (d2 !== parseInt(cpf11[10]!, 10)) return false;

  return true;
}
