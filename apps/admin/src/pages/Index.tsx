import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Globe, Landmark, Loader2, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchCotas,
  fetchFinancialSetup,
  fetchPublicWebOrigins,
} from "@/features/financial/api/tenant-financial-api";
import { getApiErrorMessage } from "@/lib/api";

export default function Index() {
  const cotasQuery = useQuery({
    queryKey: ["dashboard", "cotas-total"],
    queryFn: () => fetchCotas({ page: 1, limit: 1 }),
  });
  const setupQuery = useQuery({
    queryKey: ["dashboard", "financial-setup"],
    queryFn: fetchFinancialSetup,
  });
  const originsQuery = useQuery({
    queryKey: ["dashboard", "public-web-origins"],
    queryFn: fetchPublicWebOrigins,
  });

  const loading =
    cotasQuery.isLoading || setupQuery.isLoading || originsQuery.isLoading;
  const error =
    cotasQuery.error ?? setupQuery.error ?? originsQuery.error ?? null;

  const totalPayers = cotasQuery.data?.total ?? 0;
  const asaasOk = setupQuery.data?.isAsaasConfigured ?? false;
  const originCount = originsQuery.data?.length ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Resumo com dados reais da sua igreja neste painel. Outros módulos (eventos, site, escalas)
            aparecem na barra lateral como «Em breve».
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {getApiErrorMessage(error)}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            A carregar resumo…
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                title="Pagadores registados"
                value={String(totalPayers)}
                change="Perfis com CPF na base (área Financeiro / cotas)"
                changeType="neutral"
                icon={Users}
                iconColor="bg-primary/10 text-primary"
              />
              <StatCard
                title="Integração Asaas"
                value={asaasOk ? "Configurada" : "Pendente"}
                change={
                  asaasOk
                    ? "Chave API e token de webhook definidos"
                    : "Conclua em Configurações → Financeiro"
                }
                changeType={asaasOk ? "positive" : "negative"}
                icon={Landmark}
                iconColor={asaasOk ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"}
              />
              <StatCard
                title="Origens do site público (CORS)"
                value={String(originCount)}
                change={
                  originCount > 0
                    ? "Domínios autorizados a chamar a API pública"
                    : "Registe pelo menos uma origem em Configurações"
                }
                changeType={originCount > 0 ? "positive" : "neutral"}
                icon={Globe}
                iconColor="bg-blue-50 text-blue-600"
              />
            </div>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Próximos passos</CardTitle>
                <CardDescription>
                  O módulo financeiro (cotas e webhooks Asaas) é o que está disponível hoje.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button asChild variant="default" className="gap-2">
                  <Link to="/financeiro">
                    Ver cotas e pagadores
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/configuracoes">Configurações</Link>
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
