/**
 * Importa administradores de JSON (export auth.users + user_roles admin).
 *
 * npm run script:migrate-supabase-admin-users -- --tenant-slug=paraiso --dir=scripts/migration/staging/paraiso --dry-run
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  isBcryptHash,
  loadJsonFile,
  parseMigrateArgs,
  type StagingAdminUser,
} from './migration/lib';

async function main() {
  const args = parseMigrateArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const tenant = await prisma.tenant.findUnique({
      where: { slug: args.tenantSlug },
    });
    if (!tenant) {
      throw new Error(`Tenant não encontrado: ${args.tenantSlug}`);
    }

    const rows = loadJsonFile<StagingAdminUser>(args.dir, 'admin_users.json');
    const stats = { upserted: 0, skipped: 0, invalidPassword: [] as string[] };

    for (const row of rows) {
      const email = row.email.trim().toLowerCase();
      if (!isBcryptHash(row.password_hash)) {
        stats.invalidPassword.push(email);
        stats.skipped++;
        continue;
      }

      const existing = await prisma.adminUser.findUnique({ where: { email } });
      if (existing && existing.tenantId !== tenant.id) {
        throw new Error(
          `Email ${email} já pertence a outro tenant (${existing.tenantId})`,
        );
      }

      if (args.skipExisting && existing) {
        stats.skipped++;
        continue;
      }

      if (!args.dryRun) {
        if (existing) {
          await prisma.adminUser.update({
            where: { email },
            data: { passwordHash: row.password_hash },
          });
        } else {
          await prisma.adminUser.create({
            data: {
              id: row.id ?? randomUUID(),
              tenantId: tenant.id,
              email,
              passwordHash: row.password_hash,
              role: 'TENANT_ADMIN',
            },
          });
        }
      }
      stats.upserted++;
    }

    console.log(
      JSON.stringify(
        {
          tenant: { id: tenant.id, slug: tenant.slug },
          dryRun: args.dryRun,
          total: rows.length,
          stats,
        },
        null,
        2,
      ),
    );

    if (stats.invalidPassword.length > 0) {
      console.warn(
        'Emails sem bcrypt válido — definir password manualmente:',
        stats.invalidPassword,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
