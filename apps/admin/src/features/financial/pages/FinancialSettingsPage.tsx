import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
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
  fetchFinancialSetup,
  updateAsaasCredentials,
} from '../api/tenant-financial-api';
import {
  asaasCredentialsSchema,
  type AsaasCredentialsFormValues,
} from '../schemas/asaas-credentials-schema';

export function FinancialSettingsPage() {
  const queryClient = useQueryClient();
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);

  const setupQuery = useQuery({
    queryKey: ['financial-setup'],
    queryFn: fetchFinancialSetup,
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
    </div>
  );
}
