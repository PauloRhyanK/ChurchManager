import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/crypto.service';
import { AsaasClient } from '../financial/asaas/asaas.client';
import { UpdateAsaasCredentialsDto } from './dto/update-asaas-credentials.dto';

@Injectable()
export class TenantCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly asaas: AsaasClient,
  ) {}

  async updateAsaasCredentials(
    tenantId: string,
    dto: UpdateAsaasCredentialsDto,
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Igreja não encontrada');
    }

    // Valida chave no Asaas antes de persistir.
    await this.asaas.validateApiKey(dto.apiKey);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        asaasApiKey: this.crypto.encrypt(dto.apiKey),
        asaasWebhookToken: this.crypto.encrypt(dto.webhookToken),
      },
    });
  }

  getDecryptedApiKey(encrypted: string | null): string {
    if (!encrypted) {
      throw new InternalServerErrorException(
        'Credencial Asaas da igreja não configurada',
      );
    }
    return this.crypto.decrypt(encrypted);
  }

  getDecryptedWebhookToken(encrypted: string | null): string {
    if (!encrypted) {
      throw new InternalServerErrorException(
        'Webhook token Asaas da igreja não configurado',
      );
    }
    return this.crypto.decrypt(encrypted);
  }
}

