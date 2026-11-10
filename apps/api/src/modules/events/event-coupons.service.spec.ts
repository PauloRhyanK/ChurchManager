import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { EventCouponsService } from './event-coupons.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const TICKET_TYPE_VIP = '33333333-3333-4333-8333-333333333333';
const TICKET_TYPE_GENERAL = '44444444-4444-4444-8444-444444444444';

function buildMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    event: {
      findFirst: async () => ({ id: EVENT_ID, tenantId: TENANT_ID }),
    },
    eventCoupon: {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({ data }: { data: any }) => ({
        id: 'c1',
        ...data,
        ticketTypes: data.ticketTypes?.create?.map((t: any) => ({
          ticketTypeId: t.ticketTypeId,
        })) ?? [],
      }),
      update: async ({ data }: { data: any }) => ({
        id: 'c1',
        ...data,
        ticketTypes: [],
      }),
      delete: async () => ({ id: 'c1' }),
    },
    eventTicketType: {
      findMany: async ({ where }: any) => {
        const ids = where?.id?.in ?? [];
        return ids.map((id: string) => ({
          id,
          tenantId: TENANT_ID,
          eventId: EVENT_ID,
          name: id === TICKET_TYPE_VIP ? 'VIP' : 'Geral',
          priceCents: id === TICKET_TYPE_VIP ? 10000 : 5000,
          feeCents: 0,
        }));
      },
    },
    eventOrder: {
      count: async () => 0,
    },
    eventCouponTicketType: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async () => ({ count: 0 }),
    },
    $transaction: async (fn: any) => fn(buildMockPrisma(overrides)),
    ...overrides,
  };
}

test('EventCouponsService: cria cupom com código em caixa alta e sem espaços', async () => {
  let createdData: any = null;
  const prisma = buildMockPrisma({
    eventCoupon: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        createdData = data;
        return {
          id: 'c1',
          ...data,
          ticketTypes: [],
        };
      },
    },
  });

  const service = new EventCouponsService(prisma as any);
  const result = await service.createForEvent(TENANT_ID, EVENT_ID, {
    code: '  promo10  ',
    name: 'Desconto de 10%',
    discountType: 'PERCENTAGE',
    discountValue: 10,
  });

  assert.equal(createdData.code, 'PROMO10');
  assert.equal(result.discountValue, 10);
});

test('EventCouponsService: rejeita porcentagem inválida (< 1 ou > 100)', async () => {
  const prisma = buildMockPrisma();
  const service = new EventCouponsService(prisma as any);

  await assert.rejects(
    () =>
      service.createForEvent(TENANT_ID, EVENT_ID, {
        code: 'PROMO150',
        discountType: 'PERCENTAGE',
        discountValue: 150,
      }),
    BadRequestException,
  );

  await assert.rejects(
    () =>
      service.createForEvent(TENANT_ID, EVENT_ID, {
        code: 'PROMO0',
        discountType: 'PERCENTAGE',
        discountValue: 0,
      }),
    BadRequestException,
  );
});

test('EventCouponsService: rejeita código duplicado no mesmo evento', async () => {
  const prisma = buildMockPrisma({
    eventCoupon: {
      findUnique: async () => ({ id: 'c1', code: 'DUPLICADO' }),
    },
  });
  const service = new EventCouponsService(prisma as any);

  await assert.rejects(
    () =>
      service.createForEvent(TENANT_ID, EVENT_ID, {
        code: 'DUPLICADO',
        discountType: 'FIXED',
        discountValue: 2000,
      }),
    ConflictException,
  );
});

test('EventCouponsService: valida cupom percentual no checkout', async () => {
  const prisma = buildMockPrisma({
    eventCoupon: {
      findUnique: async () => ({
        id: 'c1',
        code: 'DESCONTO20',
        name: '20% off',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        maxUses: 10,
        usedCount: 2,
        maxUsesPerCpf: 1,
        validFrom: null,
        validUntil: null,
        active: true,
        ticketTypes: [],
      }),
    },
  });

  const service = new EventCouponsService(prisma as any);
  const validation = await service.validateCoupon(TENANT_ID, EVENT_ID, {
    code: 'DESCONTO20',
    lines: [
      { ticketTypeId: TICKET_TYPE_VIP, quantity: 1 }, // 10000 cents
      { ticketTypeId: TICKET_TYPE_GENERAL, quantity: 2 }, // 2 * 5000 = 10000 cents
    ],
  });

  assert.equal(validation.valid, true);
  // Total elegível = 20000 cents. 20% de 20000 = 4000 cents (R$ 40,00)
  assert.equal(validation.discountCents, 4000);
});

test('EventCouponsService: valida cupom restrito a tipos de ingresso específicos', async () => {
  const prisma = buildMockPrisma({
    eventCoupon: {
      findUnique: async () => ({
        id: 'c1',
        code: 'SOVIP',
        name: 'Apenas VIP',
        discountType: 'PERCENTAGE',
        discountValue: 50,
        maxUses: null,
        usedCount: 0,
        maxUsesPerCpf: 1,
        validFrom: null,
        validUntil: null,
        active: true,
        ticketTypes: [{ ticketTypeId: TICKET_TYPE_VIP }],
      }),
    },
  });

  const service = new EventCouponsService(prisma as any);
  const validation = await service.validateCoupon(TENANT_ID, EVENT_ID, {
    code: 'SOVIP',
    lines: [
      { ticketTypeId: TICKET_TYPE_VIP, quantity: 1 }, // 10000 cents (elegível)
      { ticketTypeId: TICKET_TYPE_GENERAL, quantity: 2 }, // não elegível
    ],
  });

  assert.equal(validation.valid, true);
  // 50% apenas dos 10000 do VIP = 5000 cents
  assert.equal(validation.discountCents, 5000);
});

test('EventCouponsService: rejeita cupom expirado ou esgotado', async () => {
  const expiredPrisma = buildMockPrisma({
    eventCoupon: {
      findUnique: async () => ({
        id: 'c1',
        code: 'EXPIRADO',
        discountType: 'FIXED',
        discountValue: 1000,
        maxUses: 10,
        usedCount: 0,
        maxUsesPerCpf: 1,
        validUntil: new Date('2020-01-01'),
        active: true,
        ticketTypes: [],
      }),
    },
  });
  const expiredService = new EventCouponsService(expiredPrisma as any);

  await assert.rejects(
    () =>
      expiredService.validateCoupon(TENANT_ID, EVENT_ID, {
        code: 'EXPIRADO',
        lines: [{ ticketTypeId: TICKET_TYPE_VIP, quantity: 1 }],
      }),
    /expirou/,
  );

  const exhaustedPrisma = buildMockPrisma({
    eventCoupon: {
      findUnique: async () => ({
        id: 'c1',
        code: 'ESGOTADO',
        discountType: 'FIXED',
        discountValue: 1000,
        maxUses: 5,
        usedCount: 5,
        maxUsesPerCpf: 1,
        validUntil: null,
        active: true,
        ticketTypes: [],
      }),
    },
  });
  const exhaustedService = new EventCouponsService(exhaustedPrisma as any);

  await assert.rejects(
    () =>
      exhaustedService.validateCoupon(TENANT_ID, EVENT_ID, {
        code: 'ESGOTADO',
        lines: [{ ticketTypeId: TICKET_TYPE_VIP, quantity: 1 }],
      }),
    /limite de utilizações/,
  );
});
