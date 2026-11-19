import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GenerationLimiter } from './generation-limiter';

describe('GenerationLimiter', () => {
  it('10 passam por hora, a 11ª não; depois de uma hora volta a passar', () => {
    let now = 1_000_000;
    const l = new GenerationLimiter(undefined, undefined, () => now);
    for (let i = 0; i < 10; i++) {
      assert.equal(l.take('u1'), true);
      now += 1000;
    }
    assert.equal(l.take('u1'), false);
    now = 1_000_000 + 3_600_000 - 1;
    assert.equal(l.take('u1'), false);
    now = 1_000_000 + 3_600_000;
    assert.equal(l.take('u1'), true); // a primeira saiu da janela
    assert.equal(l.take('u1'), false);
  });

  it('tentativa recusada não conta', () => {
    let now = 0;
    const l = new GenerationLimiter(2, 100, () => now);
    assert.equal(l.take('u'), true);
    assert.equal(l.take('u'), true);
    now = 50;
    assert.equal(l.take('u'), false);
    assert.equal(l.take('u'), false);
    now = 100;
    assert.equal(l.take('u'), true);
    assert.equal(l.take('u'), true);
    assert.equal(l.take('u'), false);
  });

  it('usuários independentes', () => {
    const l = new GenerationLimiter(1, 1000, () => 0);
    assert.equal(l.take('a'), true);
    assert.equal(l.take('a'), false);
    assert.equal(l.take('b'), true);
  });
});
