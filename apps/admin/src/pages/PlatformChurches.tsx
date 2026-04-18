import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { createPlatformTenant, fetchPlatformTenants } from "@/features/platform/api";
import {
  createPlatformTenantSchema,
  type CreatePlatformTenantFormValues,
} from "@/features/platform/schemas/create-tenant-schema";
import { getApiErrorMessage } from "@/lib/api";

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export default function PlatformChurches() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: fetchPlatformTenants,
  });

  const form = useForm<CreatePlatformTenantFormValues>({
    resolver: zodResolver(createPlatformTenantSchema),
    defaultValues: {
      name: "",
      slug: "",
      adminEmail: "",
      adminPassword: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: createPlatformTenant,
    onSuccess: (data) => {
      toast.success(`Igreja criada: ${data.tenant.slug}`);
      void queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
      form.reset({ name: "", slug: "", adminEmail: "", adminPassword: "" });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Plataforma — Igrejas</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Crie novos tenants (igrejas) e o primeiro administrador. Após criar, a igreja configura
            Asaas e origens públicas no próprio painel desse administrador.
          </p>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Nova igreja</CardTitle>
            <CardDescription>
              O slug identifica URLs públicas e webhooks (ex.: <code className="text-xs">minha-igreja</code>
              ).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
              noValidate
            >
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pt-name">Nome da igreja</Label>
                <Input id="pt-name" {...form.register("name")} placeholder="Igreja Exemplo" />
                {form.formState.errors.name && (
                  <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pt-slug">Slug (único)</Label>
                <Input id="pt-slug" {...form.register("slug")} placeholder="igreja-exemplo" />
                {form.formState.errors.slug && (
                  <p className="text-sm text-red-600">{form.formState.errors.slug.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pt-email">E-mail do administrador</Label>
                <Input id="pt-email" type="email" {...form.register("adminEmail")} autoComplete="off" />
                {form.formState.errors.adminEmail && (
                  <p className="text-sm text-red-600">{form.formState.errors.adminEmail.message}</p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pt-pass">Palavra-passe inicial do administrador</Label>
                <Input id="pt-pass" type="password" {...form.register("adminPassword")} autoComplete="new-password" />
                {form.formState.errors.adminPassword && (
                  <p className="text-sm text-red-600">{form.formState.errors.adminPassword.message}</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      A criar…
                    </>
                  ) : (
                    "Criar igreja"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Todas as igrejas</CardTitle>
            <CardDescription>Listagem por data de criação (mais recentes primeiro).</CardDescription>
          </CardHeader>
          <CardContent>
            {listQuery.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                A carregar…
              </div>
            ) : listQuery.isError ? (
              <p className="text-sm text-red-600">{getApiErrorMessage(listQuery.error)}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead className="hidden sm:table-cell">Criada em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(listQuery.data ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.slug}</code>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {formatDate(row.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
