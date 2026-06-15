import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export type StagingEvent = {
  id: string;
  title: string;
  description?: string | null;
  date: string;
  time_start?: string | null;
  time_end?: string | null;
  location?: string | null;
  image_url?: string | null;
  tag?: string | null;
  published?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type StagingRegistration = {
  id: string;
  event_id: string;
  name: string;
  email: string;
  phone?: string | null;
  message?: string | null;
  user_id?: string | null;
  created_at?: string;
};

export type StagingSchedule = {
  id: string;
  title: string;
  day_of_week: string;
  time_start: string;
  location?: string | null;
  description?: string | null;
  active?: boolean;
  sort_order?: number;
  created_at?: string;
};

export type StagingAdminUser = {
  id?: string;
  email: string;
  password_hash: string;
};

export type MigrateArgs = {
  tenantSlug: string;
  dir: string;
  dryRun: boolean;
  skipExisting: boolean;
};

export function parseMigrateArgs(argv: string[]): MigrateArgs {
  const tenantSlug = argv.find((a) => a.startsWith('--tenant-slug='))?.split('=')[1]?.trim();
  const dir = argv.find((a) => a.startsWith('--dir='))?.split('=')[1]?.trim();
  if (!tenantSlug) {
    throw new Error('--tenant-slug= é obrigatório');
  }
  if (!dir) {
    throw new Error('--dir= é obrigatório');
  }
  return {
    tenantSlug,
    dir,
    dryRun: argv.includes('--dry-run'),
    skipExisting: argv.includes('--skip-existing'),
  };
}

export function loadJsonFile<T>(dir: string, filename: string): T[] {
  const path = join(dir, filename);
  if (!existsSync(path)) {
    return [];
  }
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${filename} deve ser um array JSON`);
  }
  return parsed as T[];
}

export function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

export function parseOptionalDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Converte time string para Date UTC (Prisma @db.Time). */
export function parseStagingTime(value: string | null | undefined): Date | null {
  if (value == null || String(value).trim() === '') return null;
  const parts = String(value).trim().split(':').map(Number);
  const h = parts[0] ?? 0;
  const min = parts[1] ?? 0;
  const sec = parts[2] ?? 0;
  return new Date(Date.UTC(1970, 0, 1, h, min, sec));
}

/** Converte date string YYYY-MM-DD para Date @db.Date. */
export function parseStagingDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
