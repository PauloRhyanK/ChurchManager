import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getApiErrorMessage } from '@/lib/api';
import {
  createPublicWebOrigin,
  deletePublicWebOrigin,
  fetchFinancialSetup,
  fetchPublicWebOrigins,
  updateAsaasCredentials,
  updatePaymentSuccessRedirect,
} from '../api/tenant-financial-api';
import {
  asaasCredentialsSchema,
  type AsaasCredentialsFormValues,
} from '../schemas/asaas-credentials-schema';

export function FinancialSettingsPage() {
  const queryClient = useQueryClient();
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);
  const [newOrigin, setNewOrigin] = useState('');
  const [paymentSuccessUrlDraft, setPaymentSuccessUrlDraft] = useState('');

  const setupQuery = useQuery({
    queryKey: ['financial-setup'],
    queryFn: fetchFinancialSetup,
  });

  const originsQuery = useQuery({
    queryKey: ['public-web-origins'],
    queryFn: fetchPublicWebOrigins,
  });

  const addOriginMutation = useMutation({
    mutationFn: createPublicWebOrigin,
    onSuccess: () => {
      toast.success('Origem registada.');
      void queryClient.invalidateQueries({ queryKey: ['public-web-origins'] });
      setNewOrigin('');
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  const removeOriginMutation = useMutation({
    mutationFn: deletePublicWebOrigin,
    onSuccess: () => {
      toast.success('Origem removida.');
      void queryClient.invalidateQueries({ queryKey: ['public-web-origins'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  const form = useForm<AsaasCredentialsFormValues>({
    resolver: zodResolver(asaasCredentialsSchema),
    defaultValues: { apiKey: '', webhookToken: '' },
  });

  const mutation = useMutation({
    mutationFn: updateAsaasCredentials,
    onSuccess: () => {
      toast.success('Configurações salvas com sucesso!');
      void queryClient.invalidateQueries({ queryKey: ['financial-setup'] });
      form.reset({ apiKey: '', webhookToken: '' });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  useEffect(() => {
    if (setupQuery.data) {
      setPaymentSuccessUrlDraft(setupQuery.data.paymentSuccessRedirectUrl ?? '');
    }
  }, [setupQuery.data]);

  const paymentRedirectMutation = useMutation({
    mutationFn: updatePaymentSuccessRedirect,
    onSuccess: () => {
      toast.success('URL de retorno guardado.');
      void queryClient.invalidateQueries({ queryKey: ['financial-setup'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Configurações financeiras
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Cofre da igreja — credenciais Asaas apenas no servidor, cifradas na
          base de dados.
        </p>
      </div>

      {setupQuery.data?.isAsaasConfigured && (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          Credenciais já configuradas. Preencha os campos abaixo apenas se
          desejar substituí-las.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Asaas</CardTitle>
          <CardDescription>
            API Key e token de webhook da conta Asaas desta igreja. Nunca
            partilhe estes valores.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor="apiKey">Asaas API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  autoComplete="off"
                  className="font-mono text-sm"
                  {...form.register('apiKey')}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowApiKey((s) => !s)}
                  aria-label={showApiKey ? 'Ocultar chave' : 'Mostrar chave'}
                >
                  {showApiKey ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              {form.formState.errors.apiKey && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {form.formState.errors.apiKey.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhookToken">Asaas Webhook Token</Label>
              <div className="flex gap-2">
                <Input
                  id="webhookToken"
                  type={showWebhook ? 'text' : 'password'}
                  autoComplete="off"
                  className="font-mono text-sm"
                  {...form.register('webhookToken')}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowWebhook((s) => !s)}
                  aria-label={
                    showWebhook ? 'Ocultar token' : 'Mostrar token'
                  }
                >
                  {showWebhook ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              {form.formState.errors.webhookToken && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {form.formState.errors.webhookToken.message}
                </p>
              )}
            </div>

            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  A guardar…
                </>
              ) : (
                'Guardar configurações'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Site público (CORS)</CardTitle>
          <CardDescription>
            O valor tem de coincidir com o que o browser envia em{' '}
            <strong>Origin</strong> (barra de endereço: mesmo host, porta e{' '}
            <code className="text-xs">http</code> vs <code className="text-xs">https</code>
            ). Podes escrever só <code className="text-xs">localhost:3001</code> — o
            servidor completa com <code className="text-xs">http://</code>.{' '}
            <code className="text-xs">localhost</code> e{' '}
            <code className="text-xs">127.0.0.1</code> são origens diferentes; regista a
            que o site usa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {originsQuery.isLoading && (
            <p className="text-sm text-[var(--muted-foreground)]">A carregar…</p>
          )}
          {originsQuery.isError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {getApiErrorMessage(originsQuery.error)}
            </p>
          )}
          {originsQuery.data && originsQuery.data.length === 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">
              Nenhuma origem registada. O browser bloqueará pedidos ao domínio da
              API a partir de sites externos.
            </p>
          )}
          <ul className="space-y-2">
            {originsQuery.data?.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 font-mono text-sm"
              >
                <span className="truncate">{row.origin}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={removeOriginMutation.isPending}
                  onClick={() => removeOriginMutation.mutate(row.id)}
                >
                  Remover
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              const v = newOrigin.trim();
              if (!v) return;
              addOriginMutation.mutate(v);
            }}
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="publicOrigin">Nova origem</Label>
              <Input
                id="publicOrigin"
                placeholder="https://www.exemplo.org ou localhost:3001"
                className="font-mono text-sm"
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
                autoComplete="off"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={addOriginMutation.isPending || !newOrigin.trim()}
            >
              {addOriginMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                'Adicionar'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Redirecionamento após pagamento (Asaas)</CardTitle>
          <CardDescription>
            URL completa para onde o pagador volta depois do pagamento na página Asaas (pode incluir parâmetros após{' '}
            <code className="text-xs">?</code>). O <strong>origin</strong> deste URL deve estar nas origens públicas
            (cartão acima); o domínio também deve constar nos dados comerciais da conta Asaas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="paymentSuccessUrl">URL de sucesso</Label>
            <Input
              id="paymentSuccessUrl"
              className="font-mono text-sm"
              placeholder="https://cotas.exemplo.org/obrigado?origem=asaas"
              value={paymentSuccessUrlDraft}
              onChange={(e) => setPaymentSuccessUrlDraft(e.target.value)}
              autoComplete="off"
            />
            <p className="text-sm text-[var(--muted-foreground)]">
              Deixe vazio e guarde para remover. O site público pode enviar <code className="text-xs">successUrl</code> no
              pedido e substituir esta predefinição.
            </p>
          </div>
          <Button
            type="button"
            disabled={paymentRedirectMutation.isPending}
            onClick={() =>
              paymentRedirectMutation.mutate({
                paymentSuccessRedirectUrl:
                  paymentSuccessUrlDraft.trim() === '' ? null : paymentSuccessUrlDraft.trim(),
              })
            }
          >
            {paymentRedirectMutation.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                A guardar…
              </>
            ) : (
              'Guardar URL de retorno'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
