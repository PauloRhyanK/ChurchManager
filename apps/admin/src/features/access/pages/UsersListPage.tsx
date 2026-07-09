import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, UserPlus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApiErrorMessage } from "@/lib/api";
import { fetchPermissionGroups } from "../api/permission-groups-api";
import {
  approveUser,
  fetchPendingUsers,
  fetchTenantUsers,
  rejectUser,
  updateTenantUser,
  type TenantUserDto,
} from "../api/tenant-users-api";
import { UserStatusBadge } from "../components/UserStatusBadge";
import { usePermissions } from "../hooks/use-permissions";

export default function UsersListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can("USERS", "EDIT");
  const [editing, setEditing] = useState<TenantUserDto | null>(null);

  const usersQuery = useQuery({
    queryKey: ["tenant-users"],
    queryFn: fetchTenantUsers,
  });
  const pendingQuery = useQuery({
    queryKey: ["tenant-users", "pending"],
    queryFn: fetchPendingUsers,
  });
  const groupsQuery = useQuery({
    queryKey: ["permission-groups"],
    queryFn: fetchPermissionGroups,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["tenant-users"] });
  }

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "ACTIVE" | "SUSPENDED";
    }) => updateTenantUser(id, { status }),
    onSuccess: () => {
      toast.success("Utilizador atualizado");
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const approveMutation = useMutation({
    mutationFn: approveUser,
    onSuccess: () => {
      toast.success("Cadastro aprovado");
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: rejectUser,
    onSuccess: () => {
      toast.success("Cadastro rejeitado");
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const pendingCount = pendingQuery.data?.length ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Utilizadores</h1>
            </div>
            <p className="text-muted-foreground text-sm max-w-2xl">
              Gerencie quem acede ao painel da igreja e a que módulos, através de
              grupos de permissões.
            </p>
          </div>
          {canEdit && (
            <Button
              className="gap-2"
              onClick={() => navigate("/equipe/usuarios/convidar")}
            >
              <UserPlus className="h-4 w-4" />
              Convidar utilizador
            </Button>
          )}
        </div>

        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">Ativos e convidados</TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              Pendentes
              {pendingCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                {usersQuery.isLoading ? (
                  <LoadingRow />
                ) : usersQuery.isError ? (
                  <p className="text-sm text-red-600">
                    {getApiErrorMessage(usersQuery.error)}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Utilizador</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Grupos</TableHead>
                        <TableHead className="w-40" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(usersQuery.data ?? []).map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="font-medium">
                              {user.name || user.email}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {user.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            <UserStatusBadge status={user.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {user.role === "TENANT_ADMIN" ||
                              user.role === "PLATFORM_ADMIN" ? (
                                <Badge className="font-normal">
                                  Administrador
                                </Badge>
                              ) : user.groups.length === 0 ? (
                                <span className="text-xs text-muted-foreground">
                                  Nenhum
                                </span>
                              ) : (
                                user.groups.map((g) => (
                                  <Badge
                                    key={g.id}
                                    variant="secondary"
                                    className="font-normal"
                                  >
                                    {g.name}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {canEdit &&
                              user.role !== "TENANT_ADMIN" &&
                              user.role !== "PLATFORM_ADMIN" && (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditing(user)}
                                  >
                                    Grupos
                                  </Button>
                                  {user.status === "SUSPENDED" ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={statusMutation.isPending}
                                      onClick={() =>
                                        statusMutation.mutate({
                                          id: user.id,
                                          status: "ACTIVE",
                                        })
                                      }
                                    >
                                      Reativar
                                    </Button>
                                  ) : user.status === "ACTIVE" ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={statusMutation.isPending}
                                      onClick={() =>
                                        statusMutation.mutate({
                                          id: user.id,
                                          status: "SUSPENDED",
                                        })
                                      }
                                    >
                                      Suspender
                                    </Button>
                                  ) : null}
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
          </TabsContent>

          <TabsContent value="pending" className="mt-4">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Cadastros pendentes</CardTitle>
                <CardDescription>
                  Pessoas que se registaram por um link de cadastro e aguardam
                  aprovação.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingQuery.isLoading ? (
                  <LoadingRow />
                ) : pendingQuery.isError ? (
                  <p className="text-sm text-red-600">
                    {getApiErrorMessage(pendingQuery.error)}
                  </p>
                ) : pendingCount === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Nenhum cadastro pendente.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Utilizador</TableHead>
                        <TableHead className="w-48" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(pendingQuery.data ?? []).map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="font-medium">
                              {user.name || user.email}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {user.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            {canEdit && (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  className="gap-1"
                                  disabled={approveMutation.isPending}
                                  onClick={() => approveMutation.mutate(user.id)}
                                >
                                  <Check className="h-4 w-4" />
                                  Aprovar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1"
                                  disabled={rejectMutation.isPending}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Rejeitar o cadastro de ${user.email}?`,
                                      )
                                    ) {
                                      rejectMutation.mutate(user.id);
                                    }
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                  Rejeitar
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
          </TabsContent>
        </Tabs>
      </div>

      <EditGroupsDialog
        user={editing}
        groups={groupsQuery.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          invalidate();
        }}
      />
    </DashboardLayout>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
      <Loader2 className="h-4 w-4 animate-spin" />
      A carregar…
    </div>
  );
}

interface EditGroupsDialogProps {
  user: TenantUserDto | null;
  groups: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

function EditGroupsDialog({
  user,
  groups,
  onClose,
  onSaved,
}: EditGroupsDialogProps) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected(user ? user.groups.map((g) => g.id) : []);
  }, [user]);

  const mutation = useMutation({
    mutationFn: () =>
      updateTenantUser(user!.id, { groupIds: selected }),
    onSuccess: () => {
      toast.success("Grupos atualizados");
      onSaved();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grupos de {user?.name || user?.email}</DialogTitle>
          <DialogDescription>
            Selecione os grupos de permissões deste utilizador.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-72 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum grupo disponível. Crie grupos primeiro.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="flex items-center gap-2">
                <Checkbox
                  id={`grp-${group.id}`}
                  checked={selected.includes(group.id)}
                  onCheckedChange={() => toggle(group.id)}
                />
                <Label htmlFor={`grp-${group.id}`} className="font-normal">
                  {group.name}
                </Label>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={mutation.isPending || !user}
            onClick={() => mutation.mutate()}
            className="gap-2"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
