import { describe, expect, it } from 'vitest';
import { exportFileName } from './file-name';

describe('exportFileName', () => {
  it('tira acentos, usa minúsculas e hífens', () => {
    expect(exportFileName('Luz que não se apaga', 'pptx')).toBe('luz-que-nao-se-apaga.pptx');
    expect(exportFileName('  --Ação & Fé!!  ', 'txt')).toBe('acao-fe.txt');
  });
  it('barras, pontos e acentos', () => {
    expect(exportFileName('../Luz/que.não', 'pptx')).toBe('luz-que-nao.pptx');
    expect(exportFileName('../../..///', 'txt')).toBe('palavra.txt');
  });
  it('vazio vira palavra', () => {
    expect(exportFileName('', 'pptx')).toBe('palavra.pptx');
    expect(exportFileName('!!!', 'txt')).toBe('palavra.txt');
  });
  it('limita a 80 caracteres antes da extensão, sem hífen na ponta', () => {
    const name = exportFileName('a'.repeat(79) + ' b' + 'c'.repeat(20), 'pptx');
    expect(name.replace('.pptx', '').length).toBeLessThanOrEqual(80);
    expect(name).not.toMatch(/-\.pptx$/);
  });
});
