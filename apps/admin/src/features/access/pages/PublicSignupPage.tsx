import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import { fetchSignupInfo, submitSignup } from "../api/public-onboarding-api";

export default function PublicSignupPage() {
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  const infoQuery = useQuery({
    queryKey: ["public-signup", token],
    queryFn: () => fetchSignupInfo(token as string),
    enabled: Boolean(token),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () =>
      submitSignup(token as string, {
        name: name.trim(),
        email: email.trim(),
        password,
      }),
    onSuccess: () => setDone(true),
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const passwordsMatch = password.length >= 8 && password === confirm;
  const emailValid = /.+@.+\..+/.test(email.trim());
  const canSubmit =
    name.trim().length >= 2 && emailValid && passwordsMatch && !mutation.isPending;

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
            <Link to="/login" className="text-sm underline">
              Ir para o login
            </Link>
          </CardContent>
        ) : done ? (
          <CardContent className="py-10 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
            <CardTitle>Cadastro enviado</CardTitle>
            <p className="text-sm text-muted-foreground">
              O seu acesso a {infoQuery.data?.churchName} ficará disponível após
              a aprovação de um administrador.
            </p>
            <Link to="/login" className="text-sm underline">
              Ir para o login
            </Link>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Cadastro — {infoQuery.data?.churchName}</CardTitle>
              <CardDescription>
                Crie a sua conta. Após o cadastro, um administrador aprova o seu
                acesso.
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
                  <Label htmlFor="su-name">Nome</Label>
                  <Input
                    id="su-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">E-mail</Label>
                  <Input
                    id="su-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-pass">Senha</Label>
                  <Input
                    id="su-pass"
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
                  <Label htmlFor="su-confirm">Confirmar senha</Label>
                  <Input
                    id="su-confirm"
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
                <Button type="submit" className="w-full gap-2" disabled={!canSubmit}>
                  {mutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Cadastrar
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
