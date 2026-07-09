import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, Plus, Power, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { getApiErrorMessage } from "@/lib/api";
import { fetchPermissionGroups } from "../api/permission-groups-api";
import {
  createSignupLink,
  deleteSignupLink,
  fetchSignupLinks,
  updateSignupLink,
} from "../api/signup-links-api";
import { CopyLinkButton } from "../components/CopyLinkButton";
import { usePermissions } from "../hooks/use-permissions";

function formatDate(iso: string | null) {
  if (!iso) return "Sem expiração";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return "—";
  }
}

export default function SignupLinksPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can("USERS", "EDIT");

  const [label, setLabel] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);

  const linksQuery = useQuery({
    queryKey: ["signup-links"],
    queryFn: fetchSignupLinks,
  });
  const groupsQuery = useQuery({
    queryKey: ["permission-groups"],
    queryFn: fetchPermissionGroups,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["signup-links"] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createSignupLink({ label: label.trim() || null, defaultGroupIds: groupIds }),
    onSuccess: () => {
      toast.success("Link criado");
      setLabel("");
      setGroupIds([]);
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateSignupLink(id, { isActive }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSignupLink,
    onSuccess: () => {
      toast.success("Link removido");
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  function toggleGroup(id: string) {
    setGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Link2 className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">
              Links de cadastro
            </h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Compartilhe um link para que várias pessoas se cadastrem nesta
            igreja. Cada cadastro precisa da sua aprovação antes de aceder.
          </p>
        </div>

        {canEdit && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Novo link</CardTitle>
              <CardDescription>
                Os grupos escolhidos são atribuídos automaticamente a quem se
                cadastrar por este link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate();
                }}
              >
                <div className="space-y-2 max-w-md">
                  <Label htmlFor="link-label">Identificação (opcional)</Label>
                  <Input
                    id="link-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Ex.: Voluntários 2026"
                  />
                </div>
                {(groupsQuery.data ?? []).length > 0 && (
                  <div className="space-y-2">
                    <Label>Grupos padrão</Label>
                    <div className="flex flex-wrap gap-3 rounded-lg border p-3">
                      {(groupsQuery.data ?? []).map((group) => (
                        <div key={group.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`link-grp-${group.id}`}
                            checked={groupIds.includes(group.id)}
                            onCheckedChange={() => toggleGroup(group.id)}
                          />
                          <Label
                            htmlFor={`link-grp-${group.id}`}
                            className="font-normal"
                          >
                            {group.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Button
                  type="submit"
                  className="gap-2"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Criar link
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Links ativos</CardTitle>
          </CardHeader>
          <CardContent>
            {linksQuery.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                A carregar…
              </div>
            ) : linksQuery.isError ? (
              <p className="text-sm text-red-600">
                {getApiErrorMessage(linksQuery.error)}
              </p>
            ) : (linksQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhum link criado ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Identificação</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden sm:table-cell">Usos</TableHead>
                    <TableHead className="hidden sm:table-cell">Expira</TableHead>
                    <TableHead className="w-56" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(linksQuery.data ?? []).map((link) => (
                    <TableRow key={link.id}>
                      <TableCell className="font-medium">
                        {link.label || "Link de cadastro"}
                      </TableCell>
                      <TableCell>
                        {link.isActive ? (
                          <Badge className="font-normal">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary" className="font-normal">
                            Inativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {link.useCount}
                        {link.maxUses != null ? ` / ${link.maxUses}` : ""}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {formatDate(link.expiresAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <CopyLinkButton value={link.url} label="Copiar" />
                          {canEdit && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={link.isActive ? "Desativar" : "Ativar"}
                                disabled={toggleMutation.isPending}
                                onClick={() =>
                                  toggleMutation.mutate({
                                    id: link.id,
                                    isActive: !link.isActive,
                                  })
                                }
                              >
                                <Power className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Remover"
                                disabled={deleteMutation.isPending}
                                onClick={() => {
                                  if (window.confirm("Remover este link?")) {
                                    deleteMutation.mutate(link.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
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
