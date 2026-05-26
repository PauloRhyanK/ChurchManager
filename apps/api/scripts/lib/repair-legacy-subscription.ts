import { AsaasClient } from '../../src/modules/financial/asaas/asaas.client';
import type { AsaasPaymentResponse } from '../../src/modules/financial/asaas/asaas.types';
import { computeSubscriptionEndDateYmd } from '../../src/modules/financial/payment-link-subscription-end';

const PAID_STATUSES = new Set(['RECEIVED', 'CONFIRMED']);

export type RepairSubscriptionInput = {
  apiKey: string;
  subscriptionId: string;
  /** ID do payment link legado no Asaas — limita auditoria ao checkout errado. */
  paymentLinkId: string;
  referenceDate: Date;
  dryRun: boolean;
};

export type RepairSubscriptionResult = {
  subscriptionId: string;
  paymentLinkId: string;
  paymentsOnLink: number;
  firstPaidPaymentId: string | null;
  paymentsCanceled: number;
  paymentsRefunded: number;
  paymentsSkipped: number;
  paymentErrors: number;
  subscriptionClosed: boolean;
  subscriptionCloseMethod: 'delete' | 'endDate' | 'none';
  subscriptionEndDate?: string;
  details: Array<Record<string, unknown>>;
};

function sortPayments(payments: AsaasPaymentResponse[]): AsaasPaymentResponse[] {
  return [...payments].sort((a, b) => {
    const byDue = (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
    if (byDue !== 0) {
      return byDue;
    }
    return a.id.localeCompare(b.id);
  });
}

async function listAllPaymentsForLink(
  asaas: AsaasClient,
  apiKey: string,
  paymentLinkId: string,
): Promise<AsaasPaymentResponse[]> {
  const all: AsaasPaymentResponse[] = [];
  let offset = 0;
  while (true) {
    const batch = await asaas.listPayments({
      apiKey,
      paymentLink: paymentLinkId,
      limit: 100,
      offset,
    });
    all.push(...batch);
    if (batch.length < 100) {
      break;
    }
    offset += 100;
  }
  return all;
}

/**
 * Encerra assinatura legada "1 mês" sem mexer em cobranças já pagas.
 *
 * - Não estorna RECEIVED/CONFIRMED (evita devolver valores indevidos).
 * - Não faz DELETE em cobranças individuais — o Asaas remove pendentes ao apagar a assinatura.
 * - PUT endDate (fallback) impede novas parcelas após o 1.º período.
 */
export async function repairLegacySubscription(
  asaas: AsaasClient,
  input: RepairSubscriptionInput,
): Promise<RepairSubscriptionResult> {
  const { apiKey, subscriptionId, paymentLinkId, referenceDate, dryRun } = input;
  const result: RepairSubscriptionResult = {
    subscriptionId,
    paymentLinkId,
    paymentsOnLink: 0,
    firstPaidPaymentId: null,
    paymentsCanceled: 0,
    paymentsRefunded: 0,
    paymentsSkipped: 0,
    paymentErrors: 0,
    subscriptionClosed: false,
    subscriptionCloseMethod: 'none',
    details: [],
  };

  const paymentsOnLink = sortPayments(
    await listAllPaymentsForLink(asaas, apiKey, paymentLinkId),
  );
  result.paymentsOnLink = paymentsOnLink.length;

  const firstPaid = paymentsOnLink.find((p) => PAID_STATUSES.has(p.status));
  result.firstPaidPaymentId = firstPaid?.id ?? null;

  const refForEnd =
    firstPaid?.dueDate != null
      ? new Date(`${firstPaid.dueDate}T12:00:00`)
      : referenceDate;
  const endDate = computeSubscriptionEndDateYmd(1, refForEnd);
  result.subscriptionEndDate = endDate;

  for (const p of paymentsOnLink) {
    result.paymentsSkipped++;
    result.details.push({
      paymentId: p.id,
      status: p.status,
      dueDate: p.dueDate,
      paymentLink: p.paymentLink ?? null,
      action: 'unchanged_no_touch',
      note:
        'Cobranças existentes não são canceladas nem estornadas por este script.',
    });
  }

  if (dryRun) {
    result.details.push({
      action: 'would_close_subscription_only',
      subscriptionId,
      paymentLinkId,
      endDate,
      note: 'DELETE /subscriptions remove parcelas pendentes no Asaas; pagas permanecem.',
    });
    return result;
  }

  try {
    await asaas.deleteSubscription({ apiKey, subscriptionId });
    result.subscriptionClosed = true;
    result.subscriptionCloseMethod = 'delete';
    result.details.push({
      action: 'subscription_deleted',
      endDate,
    });
    return result;
  } catch (deleteErr) {
    const deleteMsg =
      deleteErr instanceof Error ? deleteErr.message : String(deleteErr);
    try {
      await asaas.updateSubscription({
        apiKey,
        subscriptionId,
        body: { endDate },
      });
      result.subscriptionClosed = true;
      result.subscriptionCloseMethod = 'endDate';
      result.details.push({
        action: 'subscription_end_date_set',
        endDate,
        previousDeleteError: deleteMsg,
      });
    } catch (updateErr) {
      result.paymentErrors++;
      result.details.push({
        action: 'subscription_close_failed',
        endDate,
        deleteError: deleteMsg,
        updateError:
          updateErr instanceof Error ? updateErr.message : String(updateErr),
      });
    }
  }

  return result;
}
