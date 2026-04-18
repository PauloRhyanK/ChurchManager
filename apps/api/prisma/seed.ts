import { AdminUserRole, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

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
