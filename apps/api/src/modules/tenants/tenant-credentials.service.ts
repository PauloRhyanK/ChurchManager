import {
  BadRequestException,
  Inject,
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
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(AsaasClient) private readonly asaas: AsaasClient,
  ) {}

  async updateAsaasCredentials(
    tenantId: string,
    dto: UpdateAsaasCredentialsDto,
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Igreja não encontrada');
    }

    const data: { asaasApiKey?: string; asaasWebhookToken?: string } = {};

    if (dto.apiKey) {
      // Valida chave no Asaas antes de persistir.
      await this.asaas.validateApiKey(dto.apiKey);
      data.asaasApiKey = this.crypto.encrypt(dto.apiKey);
    }

    if (dto.webhookToken) {
      data.asaasWebhookToken = this.crypto.encrypt(dto.webhookToken);
    }

    if (!Object.keys(data).length) {
      throw new BadRequestException(
        'Informe ao menos uma credencial (apiKey ou webhookToken)',
      );
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data,
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

