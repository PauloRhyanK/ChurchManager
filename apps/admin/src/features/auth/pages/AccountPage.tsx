import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2, UserCircle } from "lucide-react";
import { useForm } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage } from "@/lib/api";
import { getStoredSession } from "@/lib/auth-storage";
import { changePassword } from "../api/account-api";
import {
  changePasswordSchema,
  type ChangePasswordFormValues,
} from "../schemas/change-password-schema";

const emptyValues: ChangePasswordFormValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export default function AccountPage() {
  const session = getStoredSession();

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: emptyValues,
  });
  const { errors } = form.formState;

  const mutation = useMutation({
    mutationFn: (values: ChangePasswordFormValues) =>
      changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: () => {
      toast.success("Senha alterada");
      form.reset(emptyValues);
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-8">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <UserCircle className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Minha conta</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Os seus dados de acesso ao painel.
          </p>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account-name">Nome</Label>
              <Input
                id="account-name"
                value={session?.user.name ?? ""}
                placeholder="Sem nome"
                readOnly
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-email">E-mail</Label>
              <Input
                id="account-email"
                value={session?.user.email ?? ""}
                readOnly
                disabled
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Alterar senha</CardTitle>
            <CardDescription>
              Confirme a senha atual e escolha uma nova.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
              noValidate
            >
              <div className="space-y-2">
                <Label htmlFor="current-password">Senha atual</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  {...form.register("currentPassword")}
                />
                {errors.currentPassword && (
                  <p className="text-sm text-red-600">
                    {errors.currentPassword.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("newPassword")}
                />
                {errors.newPassword ? (
                  <p className="text-sm text-red-600">
                    {errors.newPassword.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Mínimo de 8 caracteres.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-red-600">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="gap-2"
                disabled={mutation.isPending}
              >
                {mutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Alterar senha
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
