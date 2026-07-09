import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiErrorMessage } from "@/lib/api";
import {
  deletePermissionGroup,
  fetchPermissionGroups,
} from "../api/permission-groups-api";
import { usePermissions } from "../hooks/use-permissions";
import { PERMISSION_LEVEL_LABELS, PERMISSION_MODULES } from "../permissions";

const MODULE_LABELS = new Map(
  PERMISSION_MODULES.map((m) => [m.module, m.label]),
);

export default function PermissionGroupsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can("USERS", "EDIT");

  const groupsQuery = useQuery({
    queryKey: ["permission-groups"],
    queryFn: fetchPermissionGroups,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePermissionGroup,
    onSuccess: () => {
      toast.success("Grupo removido");
      void queryClient.invalidateQueries({ queryKey: ["permission-groups"] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">
                Grupos de permissões
              </h1>
            </div>
            <p className="text-muted-foreground text-sm max-w-2xl">
              Defina o que cada grupo pode ver ou editar. Utilizadores herdam as
              permissões de todos os grupos a que pertencem.
            </p>
          </div>
          {canEdit && (
            <Button
              className="gap-2"
              onClick={() => navigate("/equipe/grupos/novo")}
            >
              <Plus className="h-4 w-4" />
              Novo grupo
            </Button>
          )}
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Grupos</CardTitle>
            <CardDescription>
              Cada grupo reúne permissões por módulo do sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {groupsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                A carregar…
              </div>
            ) : groupsQuery.isError ? (
              <p className="text-sm text-red-600">
                {getApiErrorMessage(groupsQuery.error)}
              </p>
            ) : (groupsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhum grupo criado ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Permissões</TableHead>
                    <TableHead className="w-24 text-center">Membros</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(groupsQuery.data ?? []).map((group) => (
                    <TableRow key={group.id}>
                      <TableCell>
                        <div className="font-medium">{group.name}</div>
                        {group.description && (
                          <div className="text-xs text-muted-foreground">
                            {group.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {group.entries.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              Sem permissões
                            </span>
                          ) : (
                            group.entries.map((entry) => (
                              <Badge
                                key={entry.module}
                                variant="secondary"
                                className="font-normal"
                              >
                                {MODULE_LABELS.get(entry.module) ?? entry.module}
                                {": "}
                                {PERMISSION_LEVEL_LABELS[entry.level]}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {group.memberCount}
                      </TableCell>
                      <TableCell>
                        {canEdit && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                navigate(`/equipe/grupos/${group.id}`)
                              }
                              aria-label="Editar grupo"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Remover o grupo "${group.name}"?`,
                                  )
                                ) {
                                  deleteMutation.mutate(group.id);
                                }
                              }}
                              aria-label="Remover grupo"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
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
