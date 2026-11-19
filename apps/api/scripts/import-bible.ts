/**
 * Importa uma tradução da Bíblia (arquivo VPL do eBible.org) para as tabelas globais.
 *   npm run script:import-bible -- --file <caminho do .txt> --code BLIVRE
 * Pode ser repetido: a importação substitui os versículos da tradução. Ver src/modules/sermons/bible/README.md.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { BIBLE_PRESETS, importBible } from '../src/modules/sermons/bible/bible-import';
import { parseVpl } from '../src/modules/sermons/bible/bible-vpl';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = arg('file');
  const code = arg('code');
  if (!file || !code) throw new Error('Uso: npm run script:import-bible -- --file <caminho do .txt> --code BLIVRE');
  const meta = BIBLE_PRESETS[code];
  if (!meta) throw new Error(`Código "${code}" desconhecido. Disponíveis: ${Object.keys(BIBLE_PRESETS).join(', ')}`);
  const verses = parseVpl(readFileSync(file, 'utf8'));
  const prisma = new PrismaClient();
  try {
    const res = await importBible(prisma, meta, verses);
    console.log(`${code}: ${res.verses} versículos importados.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
