import { api } from '@/lib/api';

export interface FinancialSetupResponse {
  isAsaasConfigured: boolean;
}

export async function fetchFinancialSetup() {
  const { data } = await api.get<FinancialSetupResponse>(
    '/admin/tenants/me/financial-setup',
  );
  return data;
}

export async function updateAsaasCredentials(body: {
  apiKey: string;
  webhookToken: string;
}) {
  const { data } = await api.put<{ ok: boolean }>(
    '/admin/tenants/me/asaas-credentials',
    body,
  );
  return data;
}

export interface PublicWebOriginDto {
  id: string;
  origin: string;
  createdAt: string;
}

export async function fetchPublicWebOrigins() {
  const { data } = await api.get<{ items: PublicWebOriginDto[] }>(
    '/admin/tenants/me/public-web-origins',
  );
  return data.items;
}

export async function createPublicWebOrigin(origin: string) {
  const { data } = await api.post<PublicWebOriginDto>(
    '/admin/tenants/me/public-web-origins',
    { origin },
  );
  return data;
}

export async function deletePublicWebOrigin(id: string) {
  const { data } = await api.delete<{ ok: boolean }>(
    `/admin/tenants/me/public-web-origins/${id}`,
  );
  return data;
}

export type QuotaStatus = 'PAID' | 'OVERDUE' | 'PENDING';

export interface CotaRowDto {
  payerProfileId: string;
  name: string;
  cpfMasked: string;
  planLabel: string;
  quotaStatus: QuotaStatus;
  lastPaymentAt: string | null;
}

export interface CotasListResponse {
  items: CotaRowDto[];
  page: number;
  limit: number;
  total: number;
}

export async function fetchCotas(params: {
  page: number;
  limit: number;
  status?: QuotaStatus;
  q?: string;
}) {
  const { data } = await api.get<CotasListResponse>(
    '/admin/tenants/me/cotas',
    { params },
  );
  return data;
}
