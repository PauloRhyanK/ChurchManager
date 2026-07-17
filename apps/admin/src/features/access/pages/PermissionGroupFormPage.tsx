import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import {
  createPermissionGroup,
  fetchPermissionGroup,
  updatePermissionGroup,
} from "../api/permission-groups-api";
import { PermissionMatrix } from "../components/PermissionMatrix";
import { GROUP_TEMPLATES, type PermissionEntry } from "../permissions";

export default function PermissionGroupFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entries, setEntries] = useState<PermissionEntry[]>([]);

  const groupQuery = useQuery({
    queryKey: ["permission-group", id],
    queryFn: () => fetchPermissionGroup(id as string),
    enabled: isEdit,
  });

  useEffect(() => {
    if (groupQuery.data) {
      setName(groupQuery.data.name);
      setDescription(groupQuery.data.description ?? "");
      setEntries(groupQuery.data.entries);
    }
  }, [groupQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        description: description.trim() || null,
        entries,
      };
      return isEdit
        ? updatePermissionGroup(id as string, input)
        : createPermissionGroup(input);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Grupo atualizado" : "Grupo criado");
      void queryClient.invalidateQueries({ queryKey: ["permission-groups"] });
      navigate("/equipe/grupos");
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const canSubmit = name.trim().length >= 2 && !saveMutation.isPending;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 -ml-2"
          onClick={() => navigate("/equipe/grupos")}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? "Editar grupo" : "Novo grupo de permissões"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Escolha o que este grupo pode ver e editar em cada módulo.
          </p>
        </div>

        {isEdit && groupQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar…
          </div>
        ) : (
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) saveMutation.mutate();
            }}
            noValidate
          >
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Detalhes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="group-name">Nome</Label>
                  <Input
                    id="group-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Editor de eventos"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="group-desc">Descrição (opcional)</Label>
                  <Textarea
                    id="group-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Para que serve este grupo"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Permissões</CardTitle>
                  <CardDescription>
                    "Editar" já inclui "Ver".
                  </CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      Modelo
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {GROUP_TEMPLATES.map((template) => (
                      <DropdownMenuItem
                        key={template.name}
                        onClick={() => {
                          setEntries(template.entries);
                          if (!name.trim()) setName(template.name);
                          if (!description.trim())
                            setDescription(template.description);
                        }}
                      >
                        {template.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <PermissionMatrix value={entries} onChange={setEntries} />
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/equipe/grupos")}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!canSubmit} className="gap-2">
                {saveMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {isEdit ? "Guardar alterações" : "Criar grupo"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
