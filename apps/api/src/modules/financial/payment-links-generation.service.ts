import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { TenantCredentialsService } from '../tenants/tenant-credentials.service';
import { AsaasClient } from './asaas/asaas.client';
import type { AsaasPaymentLinkCreateInput } from './asaas/asaas.types';
import { buildPaymentLinkExternalReference } from './payment-link-external-reference';

/** `sourceKey` para o endpoint público de cotas (webhooks / relatórios). */
export const PAYMENT_LINK_SOURCE_COTAS = 'cotas';

export interface CreatePaymentLinkOptions {
  isMonthly: boolean;
  value?: number;
  /** Identificador estável do módulo (ex.: `cotas`, `events-<uuid>`). Não use `|`. */
  sourceKey: string;
  /** Nome exibido no painel Asaas */
  asaasLinkName: string;
  asaasDescription?: string;
}

/**
 * Geração de links Asaas reutilizável: cotas hoje; eventos e outros módulos podem
 * chamar este serviço a partir de outros controllers com `sourceKey` e textos próprios.
 */
@Injectable()
export class PaymentLinksGenerationService {
  private readonly logger = new Logger(PaymentLinksGenerationService.name);

  constructor(
    private readonly asaas: AsaasClient,
    private readonly credentials: TenantCredentialsService,
  ) {}

  async create(tenant: Tenant, opts: CreatePaymentLinkOptions) {
    if (!tenant.asaasApiKey) {
      throw new ServiceUnavailableException(
        'Pagamentos não estão configurados para esta igreja',
      );
    }

    const apiKey = this.credentials.getDecryptedApiKey(tenant.asaasApiKey);

    const externalReference = buildPaymentLinkExternalReference(
      tenant.slug,
      opts.sourceKey,
    );

    const body: AsaasPaymentLinkCreateInput = {
      name: opts.asaasLinkName,
      description:
        opts.asaasDescription ??
        (opts.isMonthly
          ? 'Assinatura mensal (link público)'
          : 'Pagamento único (link público)'),
      billingType: 'UNDEFINED',
      chargeType: opts.isMonthly ? 'RECURRENT' : 'DETACHED',
      externalReference,
      notificationEnabled: true,
    };

    if (opts.isMonthly) {
      body.subscriptionCycle = 'MONTHLY';
    }

    if (opts.value !== undefined && opts.value !== null) {
      body.value = opts.value;
    }

    try {
      const link = await this.asaas.createPaymentLink({ apiKey, body });
      return {
        id: link.id,
        url: link.url,
        metadata: {
          source: opts.sourceKey,
          tenant: tenant.slug,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Asaas paymentLinks falhou: ${message}`);
      throw new BadGatewayException(
        'Não foi possível gerar o link de pagamento. Tente mais tarde.',
      );
    }
  }
}
