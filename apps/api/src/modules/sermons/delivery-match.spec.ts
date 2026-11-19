import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchDelivery, MatchService, deliveryHasPassed, matchDeliveries, sermonStatus } from './delivery-match';

const svc = (id: string, startTime: string): MatchService => ({ id, startTime });
const del = (id: string, startTime: string, minute: number, extra: Partial<MatchDelivery> = {}): MatchDelivery => ({
  id,
  startTime,
  createdAt: new Date(Date.UTC(2026, 10, 1, 12, minute)),
  pinned: false,
  serviceId: null,
  ...extra,
});

test('um culto às 09:00 e envio para 19:00 casa', () => {
  const r = matchDeliveries([svc('s9', '09:00')], [del('d1', '19:00', 0)]);
  assert.equal(r.get('d1'), 's9');
});

test('cultos 09:00 e 19:00, envio 19:00 fica com o das 19:00', () => {
  const r = matchDeliveries([svc('s9', '09:00'), svc('s19', '19:00')], [del('d1', '19:00', 0)]);
  assert.equal(r.get('d1'), 's19');
});

test('empate de distância vai para o culto de hora menor', () => {
  const r = matchDeliveries([svc('s19', '19:00'), svc('s9', '09:00')], [del('d1', '14:00', 0)]);
  assert.equal(r.get('d1'), 's9');
});

test('dois envios para o mesmo culto: o mais antigo casa, o outro fica null', () => {
  const r = matchDeliveries([svc('s9', '09:00')], [del('b', '09:00', 5), del('a', '09:00', 1)]);
  assert.equal(r.get('a'), 's9');
  assert.equal(r.get('b'), null);
});

test('culto ocupado por pinned: envio mais próximo fica null mesmo com outro culto livre', () => {
  const r = matchDeliveries(
    [svc('s9', '09:00'), svc('s19', '19:00')],
    [del('p', '19:00', 9, { pinned: true, serviceId: 's19' }), del('d', '18:00', 1)],
  );
  assert.equal(r.get('p'), 's19');
  assert.equal(r.get('d'), null);
});

test('pinned cujo culto não está na lista fica null', () => {
  const r = matchDeliveries([svc('s9', '09:00')], [del('p', '09:00', 0, { pinned: true, serviceId: 'sumiu' })]);
  assert.equal(r.get('p'), null);
});

test('sem cultos, todos null', () => {
  const r = matchDeliveries([], [del('a', '09:00', 0), del('b', '19:00', 1)]);
  assert.equal(r.get('a'), null);
  assert.equal(r.get('b'), null);
  assert.equal(r.size, 2);
});

test('envio que estava no culto das 09:00 muda para o das 19:00 quando ele surge', () => {
  const r = matchDeliveries(
    [svc('s9', '09:00'), svc('s19', '19:00')],
    [del('d', '19:00', 0, { serviceId: 's9' })],
  );
  assert.equal(r.get('d'), 's19');
});

test('situação: sem envio é DRAFT', () => {
  assert.equal(sermonStatus(null, new Date('2026-11-22T22:00:00Z'), 'America/Sao_Paulo'), 'DRAFT');
});

test('situação: limite em America/Sao_Paulo', () => {
  const d = { date: '2026-11-22', startTime: '19:00' };
  assert.equal(sermonStatus(d, new Date('2026-11-22T21:59:00Z'), 'America/Sao_Paulo'), 'SENT');
  assert.equal(sermonStatus(d, new Date('2026-11-22T22:01:00Z'), 'America/Sao_Paulo'), 'PREACHED');
});

test('situação: limite em America/Manaus é 23:00Z', () => {
  const d = { date: '2026-11-22', startTime: '19:00' };
  assert.equal(sermonStatus(d, new Date('2026-11-22T22:59:00Z'), 'America/Manaus'), 'SENT');
  assert.equal(sermonStatus(d, new Date('2026-11-22T23:00:00Z'), 'America/Manaus'), 'PREACHED');
});

test('deliveryHasPassed: hora local que cruza o dia UTC', () => {
  // 22:30 em São Paulo = 2026-11-23T01:30Z
  assert.equal(deliveryHasPassed('2026-11-22', '22:30', new Date('2026-11-23T01:29:00Z'), 'America/Sao_Paulo'), false);
  assert.equal(deliveryHasPassed('2026-11-22', '22:30', new Date('2026-11-23T01:30:00Z'), 'America/Sao_Paulo'), true);
});

test('deliveryHasPassed: fuso inválido cai para America/Sao_Paulo', () => {
  assert.equal(deliveryHasPassed('2026-11-22', '19:00', new Date('2026-11-22T21:59:00Z'), 'Nao/Existe'), false);
  assert.equal(deliveryHasPassed('2026-11-22', '19:00', new Date('2026-11-22T22:00:00Z'), 'Nao/Existe'), true);
});
