import { AdminUserRole, EventFieldType, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Campos de inscrição padrão criados para cada tenant. */
const DEFAULT_EVENT_FIELDS: Array<{
  key: string;
  label: string;
  type: EventFieldType;
}> = [
  { key: 'name', label: 'Nome completo', type: EventFieldType.TEXT },
  { key: 'email', label: 'E-mail', type: EventFieldType.EMAIL },
  { key: 'phone', label: 'Telefone', type: EventFieldType.PHONE },
  { key: 'cpf', label: 'CPF', type: EventFieldType.CPF },
];

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    create: {
      name: 'Igreja Demo',
      slug: 'demo',
    },
    update: { name: 'Igreja Demo' },
  });

  const existingPlan = await prisma.financialPlan.findFirst({
    where: { tenantId: tenant.id, name: 'Contribuição mensal' },
  });
  if (!existingPlan) {
    await prisma.financialPlan.create({
      data: {
        tenantId: tenant.id,
        name: 'Contribuição mensal',
        description: 'Plano de exemplo para testes',
        amountCents: 5000,
        interval: 'MONTHLY',
      },
    });
  }

  const seedEmail =
    process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase() ?? 'admin@demo.local';
  const seedPassword = process.env.ADMIN_SEED_PASSWORD ?? 'demo123456';

  const passwordHash = await bcrypt.hash(seedPassword, 10);
  await prisma.adminUser.upsert({
    where: { email: seedEmail },
    create: {
      tenantId: tenant.id,
      email: seedEmail,
      passwordHash,
      role: AdminUserRole.PLATFORM_ADMIN,
    },
    update: {
      passwordHash,
      tenantId: tenant.id,
      role: AdminUserRole.PLATFORM_ADMIN,
    },
  });

  for (const field of DEFAULT_EVENT_FIELDS) {
    await prisma.eventFieldDefinition.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: field.key } },
      create: {
        tenantId: tenant.id,
        key: field.key,
        label: field.label,
        type: field.type,
        isSystem: true,
      },
      update: {},
    });
  }

  await prisma.tenantPublicWebOrigin.upsert({
    where: {
      tenantId_origin: {
        tenantId: tenant.id,
        origin: 'http://localhost:3001',
      },
    },
    create: {
      tenantId: tenant.id,
      origin: 'http://localhost:3001',
    },
    update: {},
  });

  // eslint-disable-next-line no-console
  console.log(
    `Seed OK — tenant slug: demo | email: ${seedEmail} | ${seedPassword === 'demo123456' ? 'senha padrão demo123456 (altere em produção)' : 'senha via ADMIN_SEED_PASSWORD'} | CORS site público: http://localhost:3001`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
