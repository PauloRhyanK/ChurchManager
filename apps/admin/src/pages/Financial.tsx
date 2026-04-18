import { useQuery } from "@tanstack/react-query";
import { Inbox, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiErrorMessage } from "@/lib/api";
import { maskCpfDigits } from "@/lib/mask-cpf";
import {
  fetchCotas,
  fetchPayerPaymentHistory,
  type QuotaStatus,
} from "@/features/financial/api/tenant-financial-api";

const STATUS_OPTIONS: { value: "" | QuotaStatus; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "PAID", label: "Em dia" },
  { value: "OVERDUE", label: "Atrasado" },
  { value: "PENDING", label: "Aguardando" },
];

function statusClass(status: QuotaStatus) {
  if (status === "PAID") return "bg-emerald-100 text-emerald-700";
  if (status === "OVERDUE") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

function statusLabel(status: QuotaStatus) {
  if (status === "PAID") return "Em dia";
  if (status === "OVERDUE") return "Atrasado";
  return "Aguardando";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

const moneyBr = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatMoneyCents(cents: number) {
  return moneyBr.format(cents / 100);
}

function paymentStatusLabel(status: string) {
  const map: Record<string, string> = {
    CONFIRMED: "Confirmado",
    RECEIVED: "Recebido",
    PENDING: "Pendente",
    AWAITING_RISK_ANALYSIS: "Em análise",
    OVERDUE: "Em atraso",
    REFUNDED: "Reembolsado",
    CHARGEBACK_REQUESTED: "Chargeback pedido",
    CHARGEBACK_DISPUTE: "Chargeback em disputa",
    DUNNING_RECEIVED: "Recuperação",
    DUNNING_REQUESTED: "Recuperação pedida",
  };
  return map[status] ?? status;
}

const Financial = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 10));
  const statusParam = searchParams.get("status") as QuotaStatus | null;
  const status = statusParam && ["PAID", "OVERDUE", "PENDING"].includes(statusParam) ? statusParam : undefined;
  const qParam = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(qParam);
  const [historyPayerId, setHistoryPayerId] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(qParam);
  }, [qParam]);

  const patchParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (!v) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const trimmed = searchInput.trim();
      const current = (searchParams.get("q") ?? "").trim();
      if (trimmed !== current) {
        patchParams({ q: trimmed || undefined, page: "1" });
      }
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [searchInput, searchParams, patchParams]);

  const queryParams = useMemo(
    () => ({ page, limit, status, q: qParam.trim() || undefined }),
    [page, limit, status, qParam],
  );

  const cotasQuery = useQuery({
    queryKey: ["cotas", queryParams],
    queryFn: () => fetchCotas(queryParams),
  });

  const historyQuery = useQuery({
    queryKey: ["payer-payment-history", historyPayerId],
    queryFn: () => fetchPayerPaymentHistory(historyPayerId!),
    enabled: !!historyPayerId,
  });

  const totalPages = cotasQuery.data ? Math.max(1, Math.ceil(cotasQuery.data.total / cotasQuery.data.limit)) : 1;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Visão geral dos pagadores e estado das cotas.
            </p>
            <p className="text-muted-foreground text-xs mt-2 max-w-3xl">
              «Plano / valor» mostra primeiro a descrição e metadados enviados pelo Asaas (após
              webhooks); se não houver, usa o plano da assinatura registada na base. Use «Histórico»
              para ver cada cobrança, estado e, quando existir na descrição Asaas, o total de meses
              da assinatura e números de parcela enviados nos eventos.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="search">Pesquisar por nome</Label>
            <Input
              id="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Ex.: Maria Silva"
              className="max-w-md"
            />
          </div>
          <div className="grid gap-2 sm:w-56">
            <Label htmlFor="status">Estado</Label>
            <select
              id="status"
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={status ?? ""}
              onChange={(e) => {
                const value = e.target.value as "" | QuotaStatus;
                patchParams({ status: value || undefined, page: "1" });
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          {cotasQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              A carregar...
            </div>
          ) : cotasQuery.isError ? (
            <p className="p-8 text-center text-red-600">{getApiErrorMessage(cotasQuery.error)}</p>
          ) : !cotasQuery.data?.items.length ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Inbox className="h-10 w-10 opacity-60" />
              <p className="text-sm font-medium text-foreground">Nenhuma cota registada ainda</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Plano / valor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último pagamento</TableHead>
                  <TableHead className="w-[120px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cotasQuery.data.items.map((row) => (
                  <TableRow key={row.payerProfileId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {row.cpfMasked.includes("*") ? row.cpfMasked : maskCpfDigits(row.cpfMasked)}
                    </TableCell>
                    <TableCell>{row.planLabel}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusClass(row.quotaStatus)}>
                        {statusLabel(row.quotaStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(row.lastPaymentAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryPayerId(row.payerProfileId)}
                      >
                        Histórico
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {!!cotasQuery.data?.items.length && (
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              Página {page} de {totalPages} · {cotasQuery.data.total} registos
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => patchParams({ page: String(Math.max(1, page - 1)) })}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => patchParams({ page: String(Math.min(totalPages, page + 1)) })}
              >
                Seguinte
              </Button>
            </div>
          </div>
        )}

        <Dialog
          open={!!historyPayerId}
          onOpenChange={(open) => {
            if (!open) setHistoryPayerId(null);
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Histórico de pagamentos</DialogTitle>
              <DialogDescription>
                {historyQuery.data
                  ? `${historyQuery.data.name} · ${historyQuery.data.cpfMasked}`
                  : "A carregar dados do pagador…"}
              </DialogDescription>
            </DialogHeader>
            {historyQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                A carregar histórico…
              </div>
            ) : historyQuery.isError ? (
              <p className="text-center text-sm text-red-600">{getApiErrorMessage(historyQuery.error)}</p>
            ) : historyQuery.data ? (
              <div className="space-y-4">
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <p>
                    <span className="text-muted-foreground">Pagamentos confirmados: </span>
                    <span className="font-medium">{historyQuery.data.summary.confirmedPaymentCount}</span>
                    <span className="text-muted-foreground"> · Registos na base: </span>
                    <span className="font-medium">{historyQuery.data.summary.totalRecords}</span>
                  </p>
                  {historyQuery.data.summary.inferredRecurringTotalMonths != null ? (
                    <p className="mt-1">
                      <span className="text-muted-foreground">Mensalidades previstas (texto Asaas): </span>
                      <span className="font-medium">{historyQuery.data.summary.inferredRecurringTotalMonths}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        — comparar com «Pagamentos confirmados» para ver quantas já caíram.
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-muted-foreground">
                      Não foi possível inferir o total de meses a partir das descrições guardadas (ex. link sem
                      «N meses» na descrição).
                    </p>
                  )}
                  {historyQuery.data.summary.maxInstallmentNumberFromWebhooks != null ? (
                    <p className="mt-1 text-muted-foreground">
                      Maior número de parcela nos webhooks:{" "}
                      <span className="font-medium text-foreground">
                        {historyQuery.data.summary.maxInstallmentNumberFromWebhooks}
                      </span>{" "}
                      (o total de parcelas do cartão não vem na nossa base; consulte o Asaas se precisar do «X de
                      Y»).
                    </p>
                  ) : null}
                </div>
                {!historyQuery.data.items.length ? (
                  <p className="text-center text-sm text-muted-foreground">Ainda não há transações para este pagador.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Parcela</TableHead>
                        <TableHead>Descrição / ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyQuery.data.items.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="whitespace-nowrap text-sm">{formatDate(tx.createdAt)}</TableCell>
                          <TableCell className="font-medium">{formatMoneyCents(tx.amountCents)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs font-normal">
                              {paymentStatusLabel(tx.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {tx.installmentNumber != null ? String(tx.installmentNumber) : "—"}
                          </TableCell>
                          <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                            <span className="line-clamp-3 block text-foreground">
                              {tx.paymentDescription ?? "—"}
                            </span>
                            {tx.asaasPaymentId ? (
                              <span className="mt-0.5 block font-mono text-[11px]">{tx.asaasPaymentId}</span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Financial;
