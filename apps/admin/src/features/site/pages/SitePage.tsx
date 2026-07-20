import { useQuery } from "@tanstack/react-query";
import { Info, Loader2, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import {
  fetchSiteSchema,
  fetchSiteSections,
  type SiteSectionDto,
} from "@/features/site/api/tenant-site-content-api";
import { getSiteIcon } from "@/features/site/components/site-icons";
import { SiteSectionSheet } from "@/features/site/components/SiteSectionSheet";

const RELATIVE_TIME = new Intl.RelativeTimeFormat("pt-PT", { numeric: "auto" });

/** "Há 2 dias" a partir da data de edição, como nos outros cartões do painel. */
function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "Conteúdo original";

  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (Math.abs(diffMinutes) < 60) {
    return RELATIVE_TIME.format(diffMinutes, "minute");
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return RELATIVE_TIME.format(diffHours, "hour");
  }
  return RELATIVE_TIME.format(Math.round(diffHours / 24), "day");
}

/** Resumo curto do que a secção contém, para o utilizador se orientar no card. */
function summarize(section: SiteSectionDto): string {
  for (const [, value] of Object.entries(section.value)) {
    if (Array.isArray(value)) {
      return `${value.length} ${value.length === 1 ? "item" : "itens"}`;
    }
  }
  // O texto mais longo é o mais descritivo — o primeiro campo costuma ser um
  // fragmento de título ("VENHA NOS"), que não diz nada de relance.
  const longest = Object.values(section.value)
    .filter((value): value is string => typeof value === "string")
    .sort((a, b) => b.length - a.length)[0];

  return longest?.trim() ? longest : "Sem conteúdo";
}

export default function SitePage() {
  const { can } = usePermissions();
  const canEdit = can("SITE", "EDIT");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const schemaQuery = useQuery({
    queryKey: ["site-schema"],
    queryFn: fetchSiteSchema,
    staleTime: 5 * 60_000,
  });

  const sectionsQuery = useQuery({
    queryKey: ["site-sections"],
    queryFn: fetchSiteSections,
  });

  const sections = sectionsQuery.data ?? [];
  const openSection = sections.find((s) => s.key === openKey) ?? null;
  const openSpec = schemaQuery.data?.sections.find((s) => s.key === openKey);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestão do Site</h1>
          <p className="text-muted-foreground">
            Gerencie o conteúdo da página oficial da igreja.
          </p>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Conteúdo fora desta página</AlertTitle>
          <AlertDescription>
            A secção <strong>Eventos</strong> na home vem do módulo{" "}
            <Link to="/eventos" className="underline font-medium">
              Eventos
            </Link>{" "}
            (publicados, com data futura). A <strong>Programação</strong> vem da
            API de horários — ainda não há ecrã no painel para editá-la; contacte
            o suporte técnico se precisar de alterações.
          </AlertDescription>
        </Alert>

        {sectionsQuery.isPending ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sectionsQuery.isError ? (
          <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            Não foi possível carregar o conteúdo do site.
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {sections.map((section) => {
              const Icon = getSiteIcon(section.icon);
              return (
                <Card key={section.key} className="flex flex-col">
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{section.title}</CardTitle>
                    </div>
                    <Badge variant="secondary" className="shrink-0 font-normal">
                      {formatUpdatedAt(section.updatedAt)}
                    </Badge>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {section.description}
                      </p>
                      <p className="line-clamp-2 text-sm font-medium">
                        {summarize(section)}
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setOpenKey(section.key)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {canEdit ? "Editar" : "Ver conteúdo"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <SiteSectionSheet
        section={openSection}
        spec={openSpec}
        icons={schemaQuery.data?.icons ?? []}
        canEdit={canEdit}
        onOpenChange={(open) => {
          if (!open) setOpenKey(null);
        }}
      />
    </DashboardLayout>
  );
}
