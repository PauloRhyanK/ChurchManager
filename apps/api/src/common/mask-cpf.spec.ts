import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { maskCpfDigits } from './mask-cpf';

describe('maskCpfDigits', () => {
  it('mascara 11 dígitos no formato ***.XXX.XXX-**', () => {
    assert.equal(maskCpfDigits('12345678901'), '***.456.789-**');
  });

  it('fallback para entrada inválida', () => {
    assert.equal(maskCpfDigits('123'), '***.***.***-**');
  });
});
