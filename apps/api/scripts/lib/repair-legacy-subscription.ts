import { AsaasClient } from '../../src/modules/financial/asaas/asaas.client';
import type { AsaasPaymentResponse } from '../../src/modules/financial/asaas/asaas.types';
import { computeSubscriptionEndDateYmd } from '../../src/modules/financial/payment-link-subscription-end';

const PAID_STATUSES = new Set(['RECEIVED', 'CONFIRMED']);
const CANCELABLE_STATUSES = new Set([
  'PENDING',
  'OVERDUE',
  'AWAITING_RISK_ANALYSIS',
  'DUNNING_REQUESTED',
]);
const REFUNDABLE_STATUSES = new Set(['RECEIVED', 'CONFIRMED']);
const SKIP_STATUSES = new Set([
  'REFUNDED',
  'REFUND_IN_PROGRESS',
  'DELETED',
  'CANCELED',
  'CANCELLED',
]);

export type RepairSubscriptionInput = {
  apiKey: string;
  subscriptionId: string;
  referenceDate: Date;
  dryRun: boolean;
};

export type RepairSubscriptionResult = {
  subscriptionId: string;
  paymentsFound: number;
  firstKeptPaymentId: string | null;
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

function pickFirstKeptPaymentId(
  sorted: AsaasPaymentResponse[],
): string | null {
  for (const p of sorted) {
    if (PAID_STATUSES.has(p.status)) {
      return p.id;
    }
  }
  return sorted[0]?.id ?? null;
}

async function listAllSubscriptionPayments(
  asaas: AsaasClient,
  apiKey: string,
  subscriptionId: string,
): Promise<AsaasPaymentResponse[]> {
  const all: AsaasPaymentResponse[] = [];
  let offset = 0;
  while (true) {
    const batch = await asaas.listPayments({
      apiKey,
      subscription: subscriptionId,
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
 * Mantém a primeira cobrança (paga, ou a mais antiga por vencimento),
 * cancela pendentes extras e estorna recebidas extras; encerra a assinatura.
 */
export async function repairLegacySubscription(
  asaas: AsaasClient,
  input: RepairSubscriptionInput,
): Promise<RepairSubscriptionResult> {
  const { apiKey, subscriptionId, referenceDate, dryRun } = input;
  const result: RepairSubscriptionResult = {
    subscriptionId,
    paymentsFound: 0,
    firstKeptPaymentId: null,
    paymentsCanceled: 0,
    paymentsRefunded: 0,
    paymentsSkipped: 0,
    paymentErrors: 0,
    subscriptionClosed: false,
    subscriptionCloseMethod: 'none',
    details: [],
  };

  const payments = sortPayments(
    await listAllSubscriptionPayments(asaas, apiKey, subscriptionId),
  );
  result.paymentsFound = payments.length;
  const firstKeptId = pickFirstKeptPaymentId(payments);
  result.firstKeptPaymentId = firstKeptId;

  for (const p of payments) {
    if (!firstKeptId || p.id === firstKeptId) {
      result.details.push({
        paymentId: p.id,
        status: p.status,
        dueDate: p.dueDate,
        action: 'kept_first',
      });
      continue;
    }

    if (SKIP_STATUSES.has(p.status)) {
      result.paymentsSkipped++;
      result.details.push({
        paymentId: p.id,
        status: p.status,
        action: 'skipped_already_closed',
      });
      continue;
    }

    if (dryRun) {
      const action = CANCELABLE_STATUSES.has(p.status)
        ? 'would_cancel'
        : REFUNDABLE_STATUSES.has(p.status)
          ? 'would_refund'
          : 'would_skip_unknown_status';
      result.details.push({
        paymentId: p.id,
        status: p.status,
        dueDate: p.dueDate,
        action,
      });
      if (action === 'would_cancel') {
        result.paymentsCanceled++;
      } else if (action === 'would_refund') {
        result.paymentsRefunded++;
      } else {
        result.paymentsSkipped++;
      }
      continue;
    }

    try {
      if (CANCELABLE_STATUSES.has(p.status)) {
        await asaas.deletePayment({ apiKey, paymentId: p.id });
        result.paymentsCanceled++;
        result.details.push({
          paymentId: p.id,
          status: p.status,
          action: 'canceled',
        });
      } else if (REFUNDABLE_STATUSES.has(p.status)) {
        await asaas.refundPayment({ apiKey, paymentId: p.id });
        result.paymentsRefunded++;
        result.details.push({
          paymentId: p.id,
          status: p.status,
          action: 'refunded',
        });
      } else {
        result.paymentsSkipped++;
        result.details.push({
          paymentId: p.id,
          status: p.status,
          action: 'skipped_unknown_status',
        });
      }
    } catch (e) {
      result.paymentErrors++;
      result.details.push({
        paymentId: p.id,
        status: p.status,
        action: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const endDate = computeSubscriptionEndDateYmd(1, referenceDate);

  if (dryRun) {
    result.details.push({
      action: 'would_close_subscription',
      method: 'delete_then_endDate_fallback',
      endDate,
    });
    return result;
  }

  try {
    await asaas.deleteSubscription({ apiKey, subscriptionId });
    result.subscriptionClosed = true;
    result.subscriptionCloseMethod = 'delete';
    result.details.push({ action: 'subscription_deleted' });
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
      result.subscriptionEndDate = endDate;
      result.details.push({
        action: 'subscription_end_date_set',
        endDate,
        previousDeleteError: deleteMsg,
      });
    } catch (updateErr) {
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
