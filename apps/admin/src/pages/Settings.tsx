import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api";
import { getStoredSession } from "@/lib/auth-storage";
import {
  createPublicWebOrigin,
  deletePublicWebOrigin,
  fetchFinancialSetup,
  fetchPublicWebOrigins,
  updateAsaasCredentials,
} from "@/features/financial/api/tenant-financial-api";
import {
  asaasCredentialsSchema,
  type AsaasCredentialsFormValues,
} from "@/features/financial/schemas/asaas-credentials-schema";

const Settings = () => {
  const queryClient = useQueryClient();
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [newOrigin, setNewOrigin] = useState("");
  const session = getStoredSession();

  const setupQuery = useQuery({
    queryKey: ["financial-setup"],
    queryFn: fetchFinancialSetup,
  });

  const originsQuery = useQuery({
    queryKey: ["public-web-origins"],
    queryFn: fetchPublicWebOrigins,
  });

  const form = useForm<AsaasCredentialsFormValues>({
    resolver: zodResolver(asaasCredentialsSchema),
    defaultValues: { apiKey: "", webhookToken: "" },
  });

  const credentialsMutation = useMutation({
    mutationFn: updateAsaasCredentials,
    onSuccess: () => {
      toast.success("Credenciais Asaas salvas com sucesso.");
      void queryClient.invalidateQueries({ queryKey: ["financial-setup"] });
      form.reset({ apiKey: "", webhookToken: "" });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const addOriginMutation = useMutation({
    mutationFn: createPublicWebOrigin,
    onSuccess: () => {
      toast.success("Origem CORS adicionada.");
      setNewOrigin("");
      void queryClient.invalidateQueries({ queryKey: ["public-web-origins"] });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const removeOriginMutation = useMutation({
    mutationFn: deletePublicWebOrigin,
    onSuccess: () => {
      toast.success("Origem CORS removida.");
      void queryClient.invalidateQueries({ queryKey: ["public-web-origins"] });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const webhookUrl = useMemo(() => {
    if (!session?.user?.tenantSlug) return null;
    const rawApiUrl = import.meta.env.API_URL || import.meta.env.VITE_API_URL;
    const apiUrl = (rawApiUrl || "http://localhost:3000/api").replace(/\/$/, "");
    const base = apiUrl.endsWith("/api") ? apiUrl.slice(0, -4) : apiUrl;
    return `${base}/api/webhooks/asaas/${session.user.tenantSlug}/`;
  }, [session?.user?.tenantSlug]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie integração financeira, chave Asaas e webhook.
          </p>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Status da integração Asaas</CardTitle>
            <CardDescription>
              Verifique se a chave de API e o token de webhook estão configurados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {setupQuery.isLoading ? (
              <p className="text-muted-foreground">A carregar status...</p>
            ) : setupQuery.isError ? (
              <p className="text-red-600">{getApiErrorMessage(setupQuery.error)}</p>
            ) : (
              <>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="font-medium">
                    Credenciais Asaas: {setupQuery.data?.isAsaasConfigured ? "Configuradas" : "Não configuradas"}
                  </p>
                  <p className="text-muted-foreground">
                    {setupQuery.data?.isAsaasConfigured
                      ? "Webhook pronto para receber eventos após cadastro da URL no Asaas."
                      : "Defina API Key e Webhook Token para habilitar cobranças e sincronização."}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="font-medium">URL esperada de webhook</p>
                  <p className="mt-1 font-mono text-xs break-all">{webhookUrl ?? "Tenant indisponível na sessão."}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Credenciais Asaas</CardTitle>
            <CardDescription>
              Atualize a chave da API e o token do webhook do tenant atual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-6"
              onSubmit={form.handleSubmit((values) => {
                const payload = {
                  apiKey: values.apiKey.trim() || undefined,
                  webhookToken: values.webhookToken.trim() || undefined,
                };
                credentialsMutation.mutate(payload);
              })}
              noValidate
            >
              <div className="space-y-2">
                <Label htmlFor="apiKey">Asaas API Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="apiKey"
                    type={showApiKey ? "text" : "password"}
                    className="font-mono text-sm"
                    autoComplete="off"
                    {...form.register("apiKey")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey((s) => !s)}
                    aria-label={showApiKey ? "Ocultar chave" : "Mostrar chave"}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {form.formState.errors.apiKey && (
                  <p className="text-sm text-red-600">{form.formState.errors.apiKey.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Pode salvar apenas a API Key agora e o Webhook Token depois.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhookToken">Asaas Webhook Token</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhookToken"
                    type={showWebhookToken ? "text" : "password"}
                    className="font-mono text-sm"
                    autoComplete="off"
                    {...form.register("webhookToken")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowWebhookToken((s) => !s)}
                    aria-label={showWebhookToken ? "Ocultar token" : "Mostrar token"}
                  >
                    {showWebhookToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {form.formState.errors.webhookToken && (
                  <p className="text-sm text-red-600">{form.formState.errors.webhookToken.message}</p>
                )}
              </div>

              <Button type="submit" disabled={credentialsMutation.isPending} className="gap-2">
                {credentialsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A guardar...
                  </>
                ) : (
                  "Guardar credenciais"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Site público (CORS)</CardTitle>
            <CardDescription>
              Registre as origens permitidas para o site público consumir a API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {originsQuery.isLoading && <p className="text-sm text-muted-foreground">A carregar origens...</p>}
            {originsQuery.isError && <p className="text-sm text-red-600">{getApiErrorMessage(originsQuery.error)}</p>}
            {originsQuery.data?.map((origin) => (
              <div key={origin.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <span className="font-mono text-sm break-all">{origin.origin}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={removeOriginMutation.isPending}
                  onClick={() => removeOriginMutation.mutate(origin.id)}
                >
                  Remover
                </Button>
              </div>
            ))}

            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                const value = newOrigin.trim();
                if (!value) return;
                addOriginMutation.mutate(value);
              }}
            >
              <div className="flex-1 space-y-2">
                <Label htmlFor="newOrigin">Nova origem</Label>
                <Input
                  id="newOrigin"
                  className="font-mono text-sm"
                  value={newOrigin}
                  onChange={(e) => setNewOrigin(e.target.value)}
                  placeholder="https://www.exemplo.org ou localhost:3001"
                />
              </div>
              <Button type="submit" variant="secondary" disabled={addOriginMutation.isPending || !newOrigin.trim()}>
                {addOriginMutation.isPending ? "A adicionar..." : "Adicionar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
