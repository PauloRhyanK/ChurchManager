import { PrismaClient } from '@prisma/client';

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
}

main()
  .then(() => {
    console.log('Seed OK (tenant slug: demo)');
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
