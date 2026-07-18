import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPasswordResetEmail } from './password-reset.email';

function build(over: Partial<Parameters<typeof buildPasswordResetEmail>[0]> = {}) {
  return buildPasswordResetEmail({
    to: 'maria@exemplo.com',
    name: 'Maria Silva',
    url: 'https://igreja.exemplo/recuperar/abc123',
    expiresInMinutes: 30,
    ...over,
  });
}

test('escapa nome e URL no HTML', () => {
  const msg = build({
    name: '<script>alert(1)</script>',
    url: 'https://igreja.exemplo/recuperar/abc"><script>alert(1)</script>',
  });

  assert.doesNotMatch(msg.html, /<script>/);
  assert.match(msg.html, /&lt;script&gt;/);
  // A aspa da URL não pode fechar o atributo href.
  assert.doesNotMatch(msg.html, /href="[^"]*"><script>/);
});

test('a versão em texto puro fica sem escapar', () => {
  const msg = build({ name: 'Maria & João' });

  assert.match(msg.text!, /Olá, Maria & João,/);
  assert.doesNotMatch(msg.text!, /&amp;/);
});
