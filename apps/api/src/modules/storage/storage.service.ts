import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client;

  constructor() {
    // Inicializamos o cliente S3 apontando para o Cloudflare R2
    this.s3Client = new S3Client({
      region: 'auto', // O R2 exige que a região seja sempre 'auto'
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    });
  }

  /**
   * Faz o upload de um ficheiro para o Cloudflare R2 e devolve o URL público.
   * @param fileBuffer O buffer do ficheiro (vindo do Multer/Request)
   * @param originalName O nome original do ficheiro (ex: 'foto.jpg')
   * @param folder Uma pasta opcional para organizar (ex: 'tenants/logos')
   * @returns O URL público completo do ficheiro
   */
  async uploadFile(fileBuffer: Buffer, originalName: string, folder: string = 'general'): Promise<string> {
    try {
      // 1. Gerar um nome de ficheiro único para evitar colisões (ex: pasta/uuid-nome.jpg)
      const extension = extname(originalName).toLowerCase();
      const uniqueFileName = `${folder}/${randomUUID()}${extension}`;

      // 2. Determinar o Content-Type correto
      const mimeType = this.getMimeType(extension);

      // 3. Preparar o comando de Upload
      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: uniqueFileName,
        Body: fileBuffer,
        ContentType: mimeType,
      });

      // 4. Enviar para a Nuvem
      await this.s3Client.send(command);

      this.logger.log(`Ficheiro uploaded com sucesso: ${uniqueFileName}`);

      // 5. Construir e devolver o URL público
      const publicBaseUrl = process.env.R2_PUBLIC_URL;
      if (!publicBaseUrl) {
        throw new Error('R2_PUBLIC_URL não está configurada.');
      }

      // Remove a barra final do URL base se existir, para evitar "//"
      const cleanBaseUrl = publicBaseUrl.endsWith('/') ? publicBaseUrl.slice(0, -1) : publicBaseUrl;

      return `${cleanBaseUrl}/${uniqueFileName}`;

    } catch (error) {
      this.logger.error(`Falha no upload para o R2: ${error}`);
      throw new InternalServerErrorException('Não foi possível fazer o upload da imagem.');
    }
  }

  /**
   * Helper simples para mapear a extensão para o MimeType correto.
   * Necessário para o browser saber como renderizar a imagem.
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }
}
