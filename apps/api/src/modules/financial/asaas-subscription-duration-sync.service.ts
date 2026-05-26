import { Inject, Injectable, Logger } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantCredentialsService } from '../tenants/tenant-credentials.service';
import { AsaasClient } from './asaas/asaas.client';
import { computeSubscriptionEndDateYmd } from './payment-link-subscription-end';

/**
 * O `endDate` em POST /paymentLinks limita o link; a assinatura criada no checkout
 * é outro recurso (/subscriptions) e o painel Asaas mostra "Data de fim da assinatura"
 * vazia até definirmos `endDate` na assinatura via API.
 */
@Injectable()
export class AsaasSubscriptionDurationSyncService {
  private readonly logger = new Logger(AsaasSubscriptionDurationSyncService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantCredentialsService)
    private readonly tenantCredentials: TenantCredentialsService,
    @Inject(AsaasClient) private readonly asaas: AsaasClient,
  ) {}

  /**
   * Copia a duração guardada no link local para a assinatura Asaas (`PUT /subscriptions/{id}`).
   */
  async applyFromPaymentLink(
    tenant: Tenant,
    asaasSubscriptionId: string,
    asaasPaymentLinkId: string,
    options?: { referenceDate?: Date },
  ): Promise<{ applied: boolean; endDate?: string; months?: number }> {
    const subId = asaasSubscriptionId.trim();
    const linkId = asaasPaymentLinkId.trim();
    if (!subId || !linkId) {
      this.logger.warn(
        `Sync endDate ignorado: subscription ou paymentLink ausente (sub=${subId || '—'}, link=${linkId || '—'})`,
      );
      return { applied: false };
    }
    if (!tenant.asaasApiKey) {
      this.logger.warn(
        `Sync endDate ignorado: tenant ${tenant.slug} sem asaas_api_key`,
      );
      return { applied: false };
    }

    const stored = await this.prisma.financialPaymentLink.findFirst({
      where: { tenantId: tenant.id, providerLinkId: linkId },
      select: {
        isMonthly: true,
        subscriptionDurationMonths: true,
        createdAt: true,
      },
    });
    if (!stored) {
      this.logger.warn(
        `Sync endDate ignorado: link ${linkId} não encontrado em financial_payment_links (tenant ${tenant.slug})`,
      );
      return { applied: false };
    }
    if (!stored.isMonthly) {
      this.logger.warn(
        `Sync endDate ignorado: link ${linkId} não é mensal (is_monthly=false)`,
      );
      return { applied: false };
    }
    const months = stored.subscriptionDurationMonths;
    if (months == null || months < 2) {
      this.logger.warn(
        `Sync endDate ignorado: link ${linkId} com subscription_duration_months=${months ?? 'null'} (< 2)`,
      );
      return { applied: false };
    }

    const from =
      options?.referenceDate ?? stored.createdAt ?? new Date();
    const endDate = computeSubscriptionEndDateYmd(months, from);
    const apiKey = this.tenantCredentials.getDecryptedApiKey(tenant.asaasApiKey);
    try {
      await this.asaas.updateSubscription({
        apiKey,
        subscriptionId: subId,
        body: { endDate },
      });
      this.logger.log(
        `Assinatura Asaas ${subId}: endDate=${endDate} (${months} meses, link ${linkId})`,
      );
      return { applied: true, endDate, months };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `Falha ao definir endDate na assinatura ${subId} (link ${linkId}): ${msg}`,
      );
      throw e;
    }
  }
}
