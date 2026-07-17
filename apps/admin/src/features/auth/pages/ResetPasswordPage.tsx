import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
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
import {
  fetchPasswordResetInfo,
  resetPassword,
} from "../api/password-reset-api";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  const infoQuery = useQuery({
    queryKey: ["password-reset", token],
    queryFn: () => fetchPasswordResetInfo(token as string),
    enabled: Boolean(token),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () => resetPassword(token as string, password),
    onSuccess: () => {
      setDone(true);
      toast.success("Senha redefinida");
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const passwordsMatch = password.length >= 8 && password === confirm;
  const canSubmit = passwordsMatch && !mutation.isPending;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md border-0 shadow-sm">
        {infoQuery.isLoading ? (
          <CardContent className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            A validar link…
          </CardContent>
        ) : infoQuery.isError ? (
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm text-red-600">
              {getApiErrorMessage(infoQuery.error)}
            </p>
            <Link to="/recuperar-senha" className="text-sm underline">
              Pedir um novo link
            </Link>
          </CardContent>
        ) : done ? (
          <CardContent className="py-10 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
            <CardTitle>Senha redefinida</CardTitle>
            <p className="text-sm text-muted-foreground">
              A sua senha foi atualizada. Já pode iniciar sessão.
            </p>
            <Button onClick={() => navigate("/login")}>Entrar</Button>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Definir nova senha</CardTitle>
              <CardDescription>
                Escolha uma nova senha para {infoQuery.data?.email}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canSubmit) mutation.mutate();
                }}
                noValidate
              >
                <div className="space-y-2">
                  <Label htmlFor="rp-pass">Nova senha</Label>
                  <Input
                    id="rp-pass"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">
                    Mínimo de 8 caracteres.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rp-confirm">Confirmar senha</Label>
                  <Input
                    id="rp-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                  {confirm.length > 0 && !passwordsMatch && (
                    <p className="text-xs text-red-600">
                      As senhas não coincidem.
                    </p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={!canSubmit}
                >
                  {mutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Redefinir senha
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
