import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { PastorsService } from './pastors.service';
import { MinistriesService } from './ministries.service';
import { SchedulesService } from '../events/schedules.service';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_OF_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const noopRevalidation = { notifyContentChanged: () => {} };

/** Delegate falso: só "enxerga" linhas do tenant B; registra escritas. */
function createDelegate(writes: string[]) {
  const rows = [{ id: ID_OF_B, tenantId: TENANT_B }];
  return {
    findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
      rows.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null,
    update: async () => {
      writes.push('update');
      return {};
    },
    delete: async () => {
      writes.push('delete');
      return {};
    },
  };
}

function build(writes: string[]) {
  const d = createDelegate(writes);
  const prisma = { churchBranch: d, pastor: d, ministry: d, schedule: d };
  return {
    branches: new BranchesService(prisma as never, noopRevalidation as never),
    pastors: new PastorsService(prisma as never, noopRevalidation as never),
    ministries: new MinistriesService(prisma as never, noopRevalidation as never),
    schedules: new SchedulesService(prisma as never),
  };
}

for (const key of ['branches', 'pastors', 'ministries', 'schedules'] as const) {
  test(`${key}: id de outro tenant → 404 e nada é alterado`, async () => {
    const writes: string[] = [];
    const svc = build(writes)[key] as unknown as {
      updateForTenant: (t: string, id: string, dto: object) => Promise<unknown>;
      removeForTenant: (t: string, id: string) => Promise<unknown>;
    };
    await assert.rejects(svc.updateForTenant(TENANT_A, ID_OF_B, { active: false }), NotFoundException);
    await assert.rejects(svc.removeForTenant(TENANT_A, ID_OF_B), NotFoundException);
    assert.deepEqual(writes, []);
  });

  test(`${key}: o próprio tenant consegue atualizar`, async () => {
    const writes: string[] = [];
    const svc = build(writes)[key] as unknown as {
      updateForTenant: (t: string, id: string, dto: object) => Promise<unknown>;
    };
    await svc.updateForTenant(TENANT_B, ID_OF_B, { active: false }).catch(() => {});
    assert.deepEqual(writes, ['update']);
  });
}
