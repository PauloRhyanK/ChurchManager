import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../storage/storage.service';

const execFileAsync = promisify(execFile);

export interface YoutubeSearchResult {
  id: string;
  title: string;
  channel: string | null;
  durationSeconds: number | null;
  thumbnail: string | null;
}

export interface YoutubeImportResult {
  title: string;
  lyrics: string;
  audio: {
    url: string;
    fileName: string;
    durationSeconds: number | null;
    sizeBytes: number;
  };
}

/** Limpa títulos do YouTube removendo sufixos comuns de clipes/ao vivo. */
export function sanitizeYoutubeTitle(raw: string): string {
  let title = raw.trim();
  const pattern = '(clipe oficial|vídeo oficial|video oficial|oficial|official video|official audio|ao vivo|live|ministração|ministracao|acoustic|acústico|lyric video|letra|4k|hd)';
  title = title.replace(new RegExp(`\\s*[([{\\-–|]\\s*${pattern}\\s*[)\\]}]?`, 'gi'), '');
  return title.trim().slice(0, 255);
}

/** Converte arquivo VTT de legendas em linhas de letra limpas. */
export function parseVttLyrics(vttContent: string): string {
  const lines = vttContent.split(/\r?\n/);
  const result: string[] = [];
  let lastLine = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('WEBVTT') || line.startsWith('Kind:') || line.startsWith('Language:')) continue;
    if (line.includes('-->')) continue;
    if (/^\d+$/.test(line)) continue;

    // Remove tags de formatação como <00:00:01.000><c>...</c>
    const cleaned = line.replace(/<[^>]+>/g, '').trim();
    if (!cleaned) continue;

    if (cleaned !== lastLine) {
      result.push(cleaned);
      lastLine = cleaned;
    }
  }

  return result.join('\n');
}

@Injectable()
export class WorshipYoutubeService {
  private readonly logger = new Logger(WorshipYoutubeService.name);

  constructor(private readonly storage: StorageService) {}

  /** Executa yt-dlp usando o binário disponível no sistema. */
  private async runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const bin = process.env.YTDLP_BIN || 'yt-dlp';
    try {
      return await execFileAsync(bin, args, { maxBuffer: 10 * 1024 * 1024 });
    } catch (err: unknown) {
      const error = err as { message?: string; stderr?: string };
      this.logger.error(`Erro ao executar yt-dlp: ${error.stderr || error.message}`);
      throw new BadRequestException('Não foi possível processar o vídeo do YouTube. Verifique o link ou termo de busca.');
    }
  }

  /** Busca vídeos no YouTube retornando os primeiros resultados com metadados. */
  async search(query: string): Promise<YoutubeSearchResult[]> {
    const q = query.trim();
    if (!q) return [];

    const { stdout } = await this.runYtDlp([
      `ytsearch5:${q}`,
      '--dump-single-json',
      '--flat-playlist',
      '--no-warnings',
      '--no-check-certificates',
    ]);

    try {
      const data = JSON.parse(stdout) as { entries?: Array<{ id?: string; title?: string; uploader?: string; channel?: string; duration?: number; thumbnails?: Array<{ url: string }> }> };
      const entries = data.entries ?? [];
      return entries
        .filter((e): e is typeof e & { id: string; title: string } => typeof e.id === 'string' && typeof e.title === 'string')
        .map((e) => ({
          id: e.id,
          title: sanitizeYoutubeTitle(e.title),
          channel: e.uploader ?? e.channel ?? null,
          durationSeconds: typeof e.duration === 'number' ? Math.round(e.duration) : null,
          thumbnail: e.thumbnails?.[0]?.url ?? null,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Baixa o áudio do vídeo, converte para MP3, extrai legendas (letra) se disponíveis,
   * salva o áudio no R2 da igreja e devolve o resultado para preencher o louvor.
   */
  async import(tenantId: string, urlOrId: string): Promise<YoutubeImportResult> {
    const raw = urlOrId.trim();
    if (!raw) {
      throw new BadRequestException('Informe o link ou ID do vídeo do YouTube.');
    }

    const videoUrl = /^[a-zA-Z0-9_-]{11}$/.test(raw)
      ? `https://www.youtube.com/watch?v=${raw}`
      : raw;

    const tmpDir = path.join(os.tmpdir(), `yt-${randomUUID()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const { stdout } = await this.runYtDlp([
        videoUrl,
        '-x',
        '--audio-format',
        'mp3',
        '--write-sub',
        '--write-auto-sub',
        '--sub-lang',
        'pt.*,pt,en.*,en',
        '--sub-format',
        'vtt',
        '--no-warnings',
        '--print',
        '%(title)s\t%(duration)s',
        '-o',
        path.join(tmpDir, 'audio.%(ext)s'),
      ]);

      let videoTitle = 'Áudio do YouTube';
      let durationSeconds: number | null = null;
      try {
        const line = stdout.trim().split('\n').find((l) => l.includes('\t')) ?? stdout.trim().split('\n')[0] ?? '';
        const [rawTitle, rawDuration] = line.split('\t');
        if (rawTitle?.trim()) {
          videoTitle = sanitizeYoutubeTitle(rawTitle.trim());
        }
        if (rawDuration?.trim()) {
          const parsed = parseFloat(rawDuration.trim());
          if (!Number.isNaN(parsed) && parsed > 0) {
            durationSeconds = Math.round(parsed);
          }
        }
      } catch {
        // Ignora erro ao extrair metadados do print
      }

      // Procura o arquivo .mp3 gerado
      const files = fs.readdirSync(tmpDir);
      const audioFile = files.find((f) => f.endsWith('.mp3'));
      if (!audioFile) {
        this.logger.error(`Nenhum arquivo .mp3 encontrado em ${tmpDir}. Arquivos gerados: ${files.join(', ') || '(nenhum)'}`);
        throw new BadRequestException('Não foi possível extrair o áudio do vídeo selecionado.');
      }

      const audioBuffer = fs.readFileSync(path.join(tmpDir, audioFile));

      // Extrai legenda se houver arquivo .vtt
      let lyrics = '';
      const vttFile = files.find((f) => f.endsWith('.vtt'));
      if (vttFile) {
        try {
          const vttContent = fs.readFileSync(path.join(tmpDir, vttFile), 'utf-8');
          lyrics = parseVttLyrics(vttContent);
        } catch {
          // Legenda opcional
        }
      }

      const fileName = `${videoTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'audio'}.mp3`;
      const uploaded = await this.storage.uploadAudio(audioBuffer, `tenants/${tenantId}/worship/audio`);

      return {
        title: videoTitle,
        lyrics,
        audio: {
          url: uploaded.url,
          fileName,
          durationSeconds,
          sizeBytes: uploaded.sizeBytes,
        },
      };
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignora erro ao limpar temp
      }
    }
  }
}
