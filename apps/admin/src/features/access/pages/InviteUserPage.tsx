import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MailPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage } from "@/lib/api";
import { fetchPermissionGroups } from "../api/permission-groups-api";
import {
  inviteUser,
  type InviteUserResult,
} from "../api/tenant-users-api";
import { CopyLinkButton } from "../components/CopyLinkButton";

export default function InviteUserPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [result, setResult] = useState<InviteUserResult | null>(null);

  const groupsQuery = useQuery({
    queryKey: ["permission-groups"],
    queryFn: fetchPermissionGroups,
  });

  const mutation = useMutation({
    mutationFn: () =>
      inviteUser({ email: email.trim(), name: name.trim() || null, groupIds }),
    onSuccess: (data) => {
      toast.success("Convite gerado");
      setResult(data);
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  function toggleGroup(id: string) {
    setGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const emailValid = /.+@.+\..+/.test(email.trim());

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 -ml-2"
          onClick={() => navigate("/equipe/usuarios")}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <div className="flex items-center gap-2">
          <MailPlus className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">
            Convidar utilizador
          </h1>
        </div>

        {result ? (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Convite pronto</CardTitle>
              <CardDescription>
                Envie este link para {result.email}. Ao abrir, a pessoa define a
                própria senha e o acesso fica ativo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-3 text-sm break-all">
                {result.url}
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyLinkButton value={result.url} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setResult(null);
                    setEmail("");
                    setName("");
                    setGroupIds([]);
                  }}
                >
                  Convidar outro
                </Button>
                <Button size="sm" onClick={() => navigate("/equipe/usuarios")}>
                  Concluir
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Dados do convite</CardTitle>
              <CardDescription>
                Geramos um link para a pessoa definir a senha. O e-mail é único
                em toda a plataforma.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (emailValid) mutation.mutate();
                }}
                noValidate
              >
                <div className="space-y-2">
                  <Label htmlFor="inv-email">E-mail</Label>
                  <Input
                    id="inv-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="pessoa@exemplo.com"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-name">Nome (opcional)</Label>
                  <Input
                    id="inv-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Grupos de permissões</Label>
                  {groupsQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      A carregar…
                    </div>
                  ) : (groupsQuery.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum grupo criado. A pessoa entrará sem permissões até
                      ser adicionada a um grupo.
                    </p>
                  ) : (
                    <div className="space-y-2 rounded-lg border p-3">
                      {(groupsQuery.data ?? []).map((group) => (
                        <div key={group.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`inv-grp-${group.id}`}
                            checked={groupIds.includes(group.id)}
                            onCheckedChange={() => toggleGroup(group.id)}
                          />
                          <Label
                            htmlFor={`inv-grp-${group.id}`}
                            className="font-normal"
                          >
                            {group.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  type="submit"
                  className="gap-2"
                  disabled={!emailValid || mutation.isPending}
                >
                  {mutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Gerar convite
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
