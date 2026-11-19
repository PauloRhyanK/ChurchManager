import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TOO_LARGE_MESSAGE = 'A imagem excede o limite de 5 MB.';

export interface DetectedImageType {
  mime: string;
  extension: string;
}

/** Detecta JPEG, PNG, WebP e GIF pela assinatura dos primeiros bytes. */
export function detectImageType(buf: Buffer): DetectedImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', extension: '.jpg' };
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', extension: '.png' };
  }
  if (buf.length >= 6) {
    const head = buf.subarray(0, 6).toString('latin1');
    if (head === 'GIF87a' || head === 'GIF89a') return { mime: 'image/gif', extension: '.gif' };
  }
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { mime: 'image/webp', extension: '.webp' };
  }
  return null;
}

export const MAX_AUDIO_BYTES = 90 * 1024 * 1024;
export const AUDIO_TOO_LARGE_MESSAGE = 'O áudio excede o limite de 90 MB.';
export const AUDIO_FORMAT_MESSAGE = 'Formato não aceito. Envie um áudio MP3, WAV, M4A, OGG ou FLAC.';

export interface DetectedAudioType {
  mime: string;
  extension: string;
}

/** Detecta MP3, WAV, M4A/AAC, OGG e FLAC pela assinatura dos primeiros bytes. */
export function detectAudioType(buf: Buffer): DetectedAudioType | null {
  if (buf.length < 12) return null;
  const ascii = (from: number, to: number) => buf.subarray(from, to).toString('latin1');
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { mime: 'audio/wav', extension: '.wav' };
  if (ascii(0, 4) === 'OggS') return { mime: 'audio/ogg', extension: '.ogg' };
  if (ascii(0, 4) === 'fLaC') return { mime: 'audio/flac', extension: '.flac' };
  if (ascii(4, 8) === 'ftyp') return { mime: 'audio/mp4', extension: '.m4a' };
  if (ascii(0, 3) === 'ID3') return { mime: 'audio/mpeg', extension: '.mp3' };
  // Quadro MPEG sem etiqueta ID3: 11 bits de sincronismo, versão e camada válidas
  // (AAC cru/ADTS tem a camada zerada e fica de fora; AAC entra como M4A).
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x18) !== 0x08 && (buf[1] & 0x06) !== 0x00) {
    return { mime: 'audio/mpeg', extension: '.mp3' };
  }
  return null;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client;

  constructor() {
    // Inicializamos o cliente S3 apontando para o Cloudflare R2
    this.s3Client = new S3Client({
      region: 'auto', // O R2 exige que a região seja sempre 'auto'
      // SDKs recentes enviam checksums por padrão, que o R2 pode recusar.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    });
  }

  /**
   * Valida e envia uma imagem para o R2 e devolve o URL público.
   * O tipo vem dos bytes iniciais (nunca do nome nem do mimetype do cliente) e
   * define tanto o ContentType quanto a extensão da chave.
   * Detalhes internos (bucket, endpoint, variáveis) só vão para o log.
   */
  async uploadImage(fileBuffer: Buffer | undefined, folder: string): Promise<string> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('Arquivo não enviado.');
    }
    if (fileBuffer.length > MAX_IMAGE_BYTES) {
      throw new PayloadTooLargeException(IMAGE_TOO_LARGE_MESSAGE);
    }
    const type = detectImageType(fileBuffer);
    if (!type) {
      throw new BadRequestException('Formato não aceito. Envie uma imagem JPEG, PNG, WebP ou GIF.');
    }

    const key = `${folder}/${randomUUID()}${type.extension}`;
    const url = await this.putObject(key, fileBuffer, type.mime, 'Não foi possível enviar a imagem. Tente novamente em instantes.');
    this.logger.log(`Imagem enviada: ${key}`);
    return url;
  }

  /**
   * Valida e envia um áudio-guia para o R2. Mesmas regras da imagem: o tipo vem
   * dos bytes, nunca do nome nem do mimetype do cliente.
   */
  async uploadAudio(fileBuffer: Buffer | undefined, folder: string): Promise<{ url: string; sizeBytes: number }> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('Arquivo não enviado.');
    }
    if (fileBuffer.length > MAX_AUDIO_BYTES) {
      throw new PayloadTooLargeException(AUDIO_TOO_LARGE_MESSAGE);
    }
    const type = detectAudioType(fileBuffer);
    if (!type) {
      throw new BadRequestException(AUDIO_FORMAT_MESSAGE);
    }
    const key = `${folder}/${randomUUID()}${type.extension}`;
    const url = await this.putObject(key, fileBuffer, type.mime, 'Não foi possível enviar o áudio. Tente novamente em instantes.');
    this.logger.log(`Áudio enviado: ${key}`);
    return { url, sizeBytes: fileBuffer.length };
  }

  /** Grava no R2 e devolve o URL público. Detalhes internos só vão para o log. */
  private async putObject(key: string, body: Buffer, contentType: string, failMessage: string): Promise<string> {
    const config = this.readConfig();
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      const e = error as {
        name?: string;
        code?: string;
        message?: string;
        cause?: { code?: string };
        $metadata?: { httpStatusCode?: number; requestId?: string };
      };
      // Só no log do servidor: a mensagem e a causa (ex.: ENOTFOUND) dizem por que o R2 falhou.
      this.logger.error(
        `Falha no upload para o R2: ${JSON.stringify({
          code: e?.name ?? e?.code ?? 'desconhecido',
          message: redactR2Credentials(e?.message ?? '').slice(0, 300),
          cause: e?.cause?.code,
          httpStatus: e?.$metadata?.httpStatusCode,
          requestId: e?.$metadata?.requestId,
        })}`,
      );
      throw new InternalServerErrorException(failMessage);
    }
    return `${config.publicBaseUrl}/${key}`;
  }

  /** Confere a configuração do R2 antes de qualquer envio. */
  private readConfig(): { bucket: string; publicBaseUrl: string } {
    const missing = [
      'R2_ENDPOINT',
      'R2_BUCKET_NAME',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_PUBLIC_URL',
    ].filter((name) => !process.env[name]?.trim());
    if (missing.length > 0) {
      this.logger.error(`Armazenamento de arquivos sem configuração. Variáveis ausentes: ${missing.join(', ')}`);
      throw new ServiceUnavailableException('Armazenamento de imagens indisponível.');
    }
    return {
      bucket: process.env.R2_BUCKET_NAME as string,
      publicBaseUrl: (process.env.R2_PUBLIC_URL as string).trim().replace(/\/+$/, ''),
    };
  }

  /**
   * Remove um ficheiro do R2 a partir do URL público devolvido por uploadFile.
   * Ignora URLs externas ou que não pertençam ao bucket configurado.
   */
  async deleteFileByPublicUrl(publicUrl: string | null | undefined): Promise<void> {
    if (!publicUrl?.trim()) return;

    const publicBaseUrl = process.env.R2_PUBLIC_URL;
    if (!publicBaseUrl) return;

    const cleanBaseUrl = publicBaseUrl.endsWith('/')
      ? publicBaseUrl.slice(0, -1)
      : publicBaseUrl;

    if (!publicUrl.startsWith(`${cleanBaseUrl}/`)) {
      return;
    }

    const key = publicUrl.slice(cleanBaseUrl.length + 1);
    if (!key) return;

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
        }),
      );
      this.logger.log(`Ficheiro removido do R2: ${key}`);
    } catch (error) {
      this.logger.warn(`Falha ao remover ficheiro do R2 (${key}): ${error}`);
    }
  }
}

/** Mascara as credenciais do R2 caso o SDK as repita na mensagem de erro. */
function redactR2Credentials(text: string): string {
  return ['R2_SECRET_ACCESS_KEY', 'R2_ACCESS_KEY_ID'].reduce((out, name) => {
    const value = process.env[name]?.trim();
    return value && value.length >= 6 ? out.split(value).join('[REDACTED]') : out;
  }, text);
}
