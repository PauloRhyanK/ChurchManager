import { useQuery } from '@tanstack/react-query';
import { Inbox, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { maskCpfDigits } from '@/lib/mask-cpf';
import {
  fetchCotas,
  type QuotaStatus,
} from '../api/tenant-financial-api';

const STATUS_OPTIONS: { value: '' | QuotaStatus; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'PAID', label: 'Em dia' },
  { value: 'OVERDUE', label: 'Atrasado' },
  { value: 'PENDING', label: 'Aguardando' },
];

function statusBadgeVariant(
  s: QuotaStatus,
): 'success' | 'destructive' | 'warning' {
  if (s === 'PAID') return 'success';
  if (s === 'OVERDUE') return 'destructive';
  return 'warning';
}

function statusLabel(s: QuotaStatus) {
  if (s === 'PAID') return 'Em dia';
  if (s === 'OVERDUE') return 'Atrasado';
  return 'Aguardando';
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

function useDebouncedEffect(
  value: string,
  delay: number,
  onDebounced: (v: string) => void,
) {
  useEffect(() => {
    const t = window.setTimeout(() => onDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay, onDebounced]);
}

export function CotasPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(
    50,
    Math.max(1, Number(searchParams.get('limit')) || 10),
  );
  const statusParam = searchParams.get('status') as QuotaStatus | null;
  const status =
    statusParam && ['PAID', 'OVERDUE', 'PENDING'].includes(statusParam)
      ? statusParam
      : undefined;
  const qParam = searchParams.get('q') ?? '';

  const [searchInput, setSearchInput] = useState(qParam);

  useEffect(() => {
    setSearchInput(qParam);
  }, [qParam]);

  const patchParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const debouncedPatchQ = useCallback(
    (v: string) => {
      const trimmed = v.trim();
      const current = (searchParams.get('q') ?? '').trim();
      if (trimmed === current) return;
      patchParams({ q: trimmed || undefined, page: '1' });
    },
    [patchParams, searchParams],
  );

  useDebouncedEffect(searchInput, 400, debouncedPatchQ);

  const queryParams = useMemo(
    () => ({ page, limit, status, q: qParam.trim() || undefined }),
    [page, limit, status, qParam],
  );

  const cotasQuery = useQuery({
    queryKey: ['cotas', queryParams],
    queryFn: () => fetchCotas(queryParams),
  });

  const totalPages = cotasQuery.data
    ? Math.max(1, Math.ceil(cotasQuery.data.total / cotasQuery.data.limit))
    : 1;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Cotas e membros
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Visão geral dos pagadores e estado da cota (paginação no servidor).
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="search">Pesquisar por nome ou e-mail</Label>
          <Input
            id="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Ex.: Maria Silva"
            className="max-w-md"
          />
        </div>
        <div className="grid gap-2 sm:w-48">
          <Label htmlFor="status">Estado</Label>
          <select
            id="status"
            className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            value={status ?? ''}
            onChange={(e) => {
              const v = e.target.value as '' | QuotaStatus;
              patchParams({
                status: v || undefined,
                page: '1',
              });
            }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        {cotasQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[var(--muted-foreground)]">
            <Loader2 className="size-6 animate-spin" />
            A carregar…
          </div>
        ) : cotasQuery.isError ? (
          <p className="p-8 text-center text-red-600 dark:text-red-400">
            Não foi possível carregar os dados.
          </p>
        ) : !cotasQuery.data?.items.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-[var(--muted-foreground)]">
            <Inbox className="size-12 opacity-50" aria-hidden />
            <p className="text-sm font-medium text-[var(--foreground)]">
              Nenhuma cota registada ainda
            </p>
            <p className="max-w-sm text-center text-xs">
              Quando existirem pagadores e pagamentos confirmados, aparecem
              aqui.
            </p>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {cotasQuery.data.items.map((row) => (
                <TableRow key={row.payerProfileId}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {row.cpfMasked.includes('*')
                      ? row.cpfMasked
                      : maskCpfDigits(row.cpfMasked)}
                  </TableCell>
                  <TableCell>{row.planLabel}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(row.quotaStatus)}>
                      {statusLabel(row.quotaStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(row.lastPaymentAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {!!cotasQuery.data?.items.length && (
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-[var(--muted-foreground)]">
            Página {page} de {totalPages} · {cotasQuery.data.total} registos
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() =>
                patchParams({ page: String(Math.max(1, page - 1)) })
              }
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() =>
                patchParams({ page: String(Math.min(totalPages, page + 1)) })
              }
            >
              Seguinte
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
