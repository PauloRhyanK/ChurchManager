import assert from 'node:assert/strict';
import test from 'node:test';
import { SuggestionRejected, correctionStats, learnFrom, validateSuggestion } from './timing-learning';

test('sugestão: aceita crescente dentro do áudio, arredonda e mantém null', () => {
  assert.deepEqual(validateSuggestion([1.234, null, 5, 9.999], 4, 10), [1.23, null, 5, 10]);
});

test('sugestão: recusa tamanho errado, fora do áudio, fora de ordem ou colado demais', () => {
  assert.throws(() => validateSuggestion([1, 2], 3, 10), SuggestionRejected);
  assert.throws(() => validateSuggestion([1, 11], 2, 10), SuggestionRejected);
  assert.throws(() => validateSuggestion([-1, 2], 2, 10), SuggestionRejected);
  assert.throws(() => validateSuggestion([3, 2], 2, 10), SuggestionRejected);
  assert.throws(() => validateSuggestion([2, 2.05], 2, 10), SuggestionRejected);
  assert.throws(() => validateSuggestion([1, '2'], 2, 10), SuggestionRejected);
  assert.throws(() => validateSuggestion('x', 2, 10), SuggestionRejected);
});

test('correção: voltar um slide é reconhecido como −1; deslocar segundos dá a média', () => {
  const before = [10, 20, 30, 40, 50];
  const back = [5, 10, 20, 30, 40];
  assert.deepEqual(correctionStats(before, back), { changedSlides: 5, meanDeltaSeconds: -9, slideShift: -1 });
  const fwd = [20, 30, 40, 50, 55];
  assert.equal(correctionStats(before, fwd).slideShift, 1);
  const fine = before.map((t) => t - 0.4);
  assert.deepEqual(correctionStats(before, fine), { changedSlides: 5, meanDeltaSeconds: -0.4, slideShift: null });
  assert.equal(correctionStats(before, before).changedSlides, 0);
});

test('aprendizado: média das correções finas, contagem de deslocamentos e exemplos de instrução', () => {
  const learned = learnFrom([
    { source: 'INSTRUCTION', instruction: 'volta um slide em tudo', changedSlides: 9, meanDeltaSeconds: -6, slideShift: -1 },
    { source: 'DRAG', instruction: null, changedSlides: 1, meanDeltaSeconds: -0.4, slideShift: null },
    { source: 'SHIFT_SECONDS', instruction: null, changedSlides: 9, meanDeltaSeconds: -0.2, slideShift: null },
    { source: 'SHIFT_SLIDES', instruction: null, changedSlides: 9, meanDeltaSeconds: -6, slideShift: -1 },
  ]);
  assert.equal(learned.corrections, 4);
  assert.equal(learned.meanFineDeltaSeconds, -0.3);
  assert.deepEqual(learned.slideShifts, { earlier: 2, later: 0 });
  assert.equal(learned.examples.length, 1);
  assert.equal(learned.examples[0].instruction, 'volta um slide em tudo');
  assert.equal(learnFrom([]).meanFineDeltaSeconds, null);
});
