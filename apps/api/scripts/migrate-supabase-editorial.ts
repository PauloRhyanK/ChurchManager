/**
 * Importa events, event_registrations e schedules de JSON (export Supabase).
 *
 * npm run script:migrate-supabase-editorial -- --tenant-slug=paraiso --dir=scripts/migration/staging/paraiso --dry-run
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  loadJsonFile,
  parseMigrateArgs,
  parseOptionalDate,
  parseStagingDate,
  parseStagingTime,
  type StagingEvent,
  type StagingRegistration,
  type StagingSchedule,
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

    const events = loadJsonFile<StagingEvent>(args.dir, 'events.json');
    const registrations = loadJsonFile<StagingRegistration>(
      args.dir,
      'event_registrations.json',
    );
    const schedules = loadJsonFile<StagingSchedule>(args.dir, 'schedules.json');

    const stats = {
      events: { inserted: 0, skipped: 0 },
      registrations: { inserted: 0, skipped: 0 },
      schedules: { inserted: 0, skipped: 0 },
    };

    console.log(
      JSON.stringify(
        {
          tenant: { id: tenant.id, slug: tenant.slug },
          dryRun: args.dryRun,
          counts: {
            events: events.length,
            registrations: registrations.length,
            schedules: schedules.length,
          },
        },
        null,
        2,
      ),
    );

    for (const row of events) {
      if (args.skipExisting) {
        const exists = await prisma.event.findFirst({
          where: { id: row.id, tenantId: tenant.id },
        });
        if (exists) {
          stats.events.skipped++;
          continue;
        }
      }
      const createdAt = parseOptionalDate(row.created_at);
      const updatedAt = parseOptionalDate(row.updated_at);
      const base = {
        id: row.id,
        tenantId: tenant.id,
        title: row.title,
        description: row.description ?? null,
        date: parseStagingDate(row.date),
        timeStart: parseStagingTime(row.time_start),
        timeEnd: parseStagingTime(row.time_end),
        location: row.location ?? null,
        imageUrl: row.image_url ?? null,
        tag: row.tag ?? null,
        published: row.published ?? true,
      };
      if (!args.dryRun) {
        await prisma.event.upsert({
          where: { id: row.id },
          create: {
            ...base,
            ...(createdAt ? { createdAt } : {}),
            ...(updatedAt ? { updatedAt } : {}),
          },
          update: {
            title: base.title,
            description: base.description,
            date: base.date,
            timeStart: base.timeStart,
            timeEnd: base.timeEnd,
            location: base.location,
            imageUrl: base.imageUrl,
            tag: base.tag,
            published: base.published,
          },
        });
      }
      stats.events.inserted++;
    }

    for (const row of registrations) {
      if (args.skipExisting) {
        const exists = await prisma.eventRegistration.findFirst({
          where: { id: row.id, tenantId: tenant.id },
        });
        if (exists) {
          stats.registrations.skipped++;
          continue;
        }
      }
      const email = row.email.trim().toLowerCase();
      const data = {
        id: row.id,
        tenantId: tenant.id,
        eventId: row.event_id,
        name: row.name.trim(),
        email,
        phone: row.phone?.trim() || null,
        message: row.message?.trim() || null,
        userId: row.user_id ?? null,
        createdAt: parseOptionalDate(row.created_at),
      };
      if (!args.dryRun) {
        await prisma.eventRegistration.upsert({
          where: { id: row.id },
          create: data,
          update: {
            name: data.name,
            email: data.email,
            phone: data.phone,
            message: data.message,
            userId: data.userId,
          },
        });
      }
      stats.registrations.inserted++;
    }

    for (const row of schedules) {
      if (args.skipExisting) {
        const exists = await prisma.schedule.findFirst({
          where: { id: row.id, tenantId: tenant.id },
        });
        if (exists) {
          stats.schedules.skipped++;
          continue;
        }
      }
      const data = {
        id: row.id,
        tenantId: tenant.id,
        title: row.title,
        dayOfWeek: row.day_of_week,
        timeStart: parseStagingTime(row.time_start)!,
        location: row.location ?? null,
        description: row.description ?? null,
        active: row.active ?? true,
        sortOrder: row.sort_order ?? 0,
        createdAt: parseOptionalDate(row.created_at),
      };
      if (!args.dryRun) {
        await prisma.schedule.upsert({
          where: { id: row.id },
          create: data,
          update: {
            title: data.title,
            dayOfWeek: data.dayOfWeek,
            timeStart: data.timeStart,
            location: data.location,
            description: data.description,
            active: data.active,
            sortOrder: data.sortOrder,
          },
        });
      }
      stats.schedules.inserted++;
    }

    console.log(JSON.stringify({ stats }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
