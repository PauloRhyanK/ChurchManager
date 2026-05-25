import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey) {
      throw new InternalServerErrorException('ENCRYPTION_KEY não configurada');
    }
    if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
      throw new InternalServerErrorException(
        'ENCRYPTION_KEY inválida: esperado hex com 64 caracteres',
      );
    }
    this.key = Buffer.from(encryptionKey, 'hex');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(payload: string | null | undefined): string {
    if (!payload) {
      throw new InternalServerErrorException('Payload cifrado ausente');
    }
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new InternalServerErrorException('Payload cifrado malformado');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new InternalServerErrorException('Payload cifrado incompleto');
    }

    try {
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const encrypted = Buffer.from(encryptedHex, 'hex');
      const decipher = createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      throw new InternalServerErrorException('Falha ao decriptar credencial');
    }
  }
}

