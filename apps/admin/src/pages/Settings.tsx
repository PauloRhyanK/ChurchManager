import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getApiErrorMessage } from "@/lib/api";
import { getStoredSession } from "@/lib/auth-storage";
import {
  createLinkPreset,
  createPublicWebOrigin,
  deleteLinkPreset,
  deletePublicWebOrigin,
  fetchFinancialSetup,
  fetchLinkPresets,
  fetchPublicWebOrigins,
  updateLinkPreset,
  updateAsaasCredentials,
  updatePaymentSuccessRedirect,
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
  const [paymentSuccessUrlDraft, setPaymentSuccessUrlDraft] = useState("");
  const [presetForm, setPresetForm] = useState({
    module: "cotas" as "cotas" | "events",
    presetKey: "",
    name: "",
    sourceKey: "",
    isMonthly: true,
    subscriptionDurationMonths: 12,
    value: "",
  });
  const session = getStoredSession();

  const setupQuery = useQuery({
    queryKey: ["financial-setup"],
    queryFn: fetchFinancialSetup,
  });

  const originsQuery = useQuery({
    queryKey: ["public-web-origins"],
    queryFn: fetchPublicWebOrigins,
  });

  const linkPresetsQuery = useQuery({
    queryKey: ["link-presets"],
    queryFn: fetchLinkPresets,
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

  const createPresetMutation = useMutation({
    mutationFn: createLinkPreset,
    onSuccess: () => {
      toast.success("Preset de link criado.");
      setPresetForm({
        module: "cotas",
        presetKey: "",
        name: "",
        sourceKey: "",
        isMonthly: true,
        subscriptionDurationMonths: 12,
        value: "",
      });
      void queryClient.invalidateQueries({ queryKey: ["link-presets"] });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const togglePresetMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateLinkPreset(id, { active }),
    onSuccess: () => {
      toast.success("Preset atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["link-presets"] });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const removePresetMutation = useMutation({
    mutationFn: deleteLinkPreset,
    onSuccess: () => {
      toast.success("Preset removido.");
      void queryClient.invalidateQueries({ queryKey: ["link-presets"] });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  useEffect(() => {
    if (setupQuery.data) {
      setPaymentSuccessUrlDraft(setupQuery.data.paymentSuccessRedirectUrl ?? "");
    }
  }, [setupQuery.data]);

  const paymentRedirectMutation = useMutation({
    mutationFn: updatePaymentSuccessRedirect,
    onSuccess: () => {
      toast.success("Redirecionamento atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["financial-setup"] });
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
            <CardTitle className="text-base">Links default (presets)</CardTitle>
            <CardDescription>
              Presets globais reutilizáveis por módulo. Cotas usa estes presets no fluxo público; eventos podem reutilizar na geração automática por tipo de ingresso.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {linkPresetsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">A carregar presets...</p>
            ) : linkPresetsQuery.isError ? (
              <p className="text-sm text-red-600">{getApiErrorMessage(linkPresetsQuery.error)}</p>
            ) : (
              <div className="space-y-2">
                {linkPresetsQuery.data?.length ? (
                  linkPresetsQuery.data.map((preset) => (
                    <div key={preset.id} className="rounded-md border p-3">
                      <p className="text-sm font-medium">{preset.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {preset.module}:{preset.presetKey} · {preset.sourceKey}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {preset.isMonthly
                          ? `${preset.subscriptionDurationMonths ?? 0}x mensal`
                          : "Pagamento único"}{" "}
                        · {preset.value != null ? `R$ ${preset.value.toFixed(2)}` : "valor livre"}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={togglePresetMutation.isPending}
                          onClick={() =>
                            togglePresetMutation.mutate({
                              id: preset.id,
                              active: !preset.active,
                            })
                          }
                        >
                          {preset.active ? "Desativar" : "Ativar"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={removePresetMutation.isPending}
                          onClick={() => removePresetMutation.mutate(preset.id)}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum preset cadastrado.</p>
                )}
              </div>
            )}

            <form
              className="grid gap-3 rounded-md border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const valueNumber =
                  presetForm.value.trim() === "" ? undefined : Number(presetForm.value);
                createPresetMutation.mutate({
                  module: presetForm.module,
                  presetKey: presetForm.presetKey.trim().toLowerCase(),
                  name: presetForm.name.trim(),
                  sourceKey: presetForm.sourceKey.trim(),
                  isMonthly: presetForm.isMonthly,
                  subscriptionDurationMonths: presetForm.isMonthly
                    ? presetForm.subscriptionDurationMonths
                    : undefined,
                  value: Number.isFinite(valueNumber) ? valueNumber : undefined,
                });
              }}
            >
              <p className="text-sm font-medium">Novo preset</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="preset-module">Módulo</Label>
                  <select
                    id="preset-module"
                    className="flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={presetForm.module}
                    onChange={(e) =>
                      setPresetForm((prev) => ({
                        ...prev,
                        module: e.target.value as "cotas" | "events",
                      }))
                    }
                  >
                    <option value="cotas">Cotas</option>
                    <option value="events">Eventos</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="preset-key">Preset key</Label>
                  <Input
                    id="preset-key"
                    value={presetForm.presetKey}
                    onChange={(e) =>
                      setPresetForm((prev) => ({ ...prev, presetKey: e.target.value }))
                    }
                    placeholder="cotas_12x_site"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="preset-name">Nome</Label>
                  <Input
                    id="preset-name"
                    value={presetForm.name}
                    onChange={(e) =>
                      setPresetForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Cotas 12x - Site"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="preset-source">Source key</Label>
                  <Input
                    id="preset-source"
                    value={presetForm.sourceKey}
                    onChange={(e) =>
                      setPresetForm((prev) => ({ ...prev, sourceKey: e.target.value }))
                    }
                    placeholder="cotas"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="preset-monthly">Frequência</Label>
                  <select
                    id="preset-monthly"
                    className="flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={presetForm.isMonthly ? "monthly" : "single"}
                    onChange={(e) =>
                      setPresetForm((prev) => ({
                        ...prev,
                        isMonthly: e.target.value === "monthly",
                      }))
                    }
                  >
                    <option value="monthly">Mensal</option>
                    <option value="single">Único</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="preset-duration">Meses</Label>
                  <Input
                    id="preset-duration"
                    type="number"
                    min={1}
                    max={120}
                    value={presetForm.subscriptionDurationMonths}
                    disabled={!presetForm.isMonthly}
                    onChange={(e) =>
                      setPresetForm((prev) => ({
                        ...prev,
                        subscriptionDurationMonths: Number(e.target.value || 12),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="preset-value">Valor (opcional)</Label>
                  <Input
                    id="preset-value"
                    value={presetForm.value}
                    onChange={(e) =>
                      setPresetForm((prev) => ({ ...prev, value: e.target.value }))
                    }
                    placeholder="50.00"
                  />
                </div>
              </div>
              <Button type="submit" disabled={createPresetMutation.isPending}>
                {createPresetMutation.isPending ? "A criar..." : "Criar preset"}
              </Button>
            </form>
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

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Redirecionamento após pagamento (Asaas)</CardTitle>
            <CardDescription>
              URL completa para onde o pagador volta depois do pagamento na página Asaas (pode incluir parâmetros após{" "}
              <code className="text-xs">?</code>). O <strong>origin</strong> deste URL deve estar listado em &quot;Site
              público (CORS)&quot; acima; o domínio também deve constar nos dados comerciais da conta Asaas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <Label htmlFor="paymentRedirectEnabled" className="text-base">
                  Usar redirecionamento (predefinição)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Quando desligado, o URL abaixo não é enviado ao Asaas nos links/cobranças sem{" "}
                  <code className="text-xs">successUrl</code> no pedido — útil enquanto o domínio não está
                  cadastrado no Asaas. O URL permanece guardado para reativar depois.
                </p>
              </div>
              <Switch
                id="paymentRedirectEnabled"
                checked={setupQuery.data?.paymentSuccessRedirectEnabled ?? true}
                disabled={setupQuery.isLoading || setupQuery.isError || paymentRedirectMutation.isPending}
                onCheckedChange={(checked) => {
                  paymentRedirectMutation.mutate({ paymentSuccessRedirectEnabled: checked });
                }}
              />
            </div>
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
              <p className="text-xs text-muted-foreground">
                Deixe vazio e guarde para remover a predefinição. O site público pode ainda enviar{" "}
                <code className="text-xs">successUrl</code> no pedido e substituir este valor.
              </p>
            </div>
            <Button
              type="button"
              disabled={paymentRedirectMutation.isPending}
              onClick={() =>
                paymentRedirectMutation.mutate({
                  paymentSuccessRedirectUrl:
                    paymentSuccessUrlDraft.trim() === "" ? null : paymentSuccessUrlDraft.trim(),
                })
              }
              className="gap-2"
            >
              {paymentRedirectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A guardar...
                </>
              ) : (
                "Guardar URL de retorno"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
