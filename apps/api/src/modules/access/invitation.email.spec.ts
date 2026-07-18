import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInvitationEmail } from './invitation.email';

function build(over: Partial<Parameters<typeof buildInvitationEmail>[0]> = {}) {
  return buildInvitationEmail({
    to: 'maria@exemplo.com',
    name: 'Maria Silva',
    churchName: 'Igreja Exemplo',
    url: 'https://igreja.exemplo/convite/abc123',
    expiresInDays: 7,
    ...over,
  });
}

test('escapa nome, igreja e URL no HTML', () => {
  const msg = build({
    name: '<script>alert(1)</script>',
    churchName: '<img src=x onerror=alert(1)>',
    url: 'https://igreja.exemplo/convite/abc"><script>alert(1)</script>',
  });

  assert.doesNotMatch(msg.html, /<script>/);
  assert.doesNotMatch(msg.html, /<img src=x/);
  assert.match(msg.html, /&lt;script&gt;/);
  // A aspa da URL não pode fechar o atributo href.
  assert.doesNotMatch(msg.html, /href="[^"]*"><script>/);
});

test('a versão em texto puro fica sem escapar', () => {
  const msg = build({ name: 'Maria & João' });

  assert.match(msg.text!, /Olá, Maria & João,/);
  assert.doesNotMatch(msg.text!, /&amp;/);
});
