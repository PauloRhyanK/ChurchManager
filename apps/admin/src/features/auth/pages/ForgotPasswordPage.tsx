import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
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
import { requestPasswordReset } from "../api/password-reset-api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const mutation = useMutation({
    mutationFn: () => requestPasswordReset(email.trim()),
    onSuccess: () => setSent(true),
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const canSubmit = email.trim().length > 3 && !mutation.isPending;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md border-0 shadow-sm">
        {sent ? (
          <CardContent className="py-10 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
            <CardTitle>Verifique o seu e-mail</CardTitle>
            <p className="text-sm text-muted-foreground">
              Se existir uma conta com esse e-mail, enviámos um link para
              redefinir a sua senha. O link expira em 60 minutos.
            </p>
            <Link to="/login" className="text-sm underline">
              Voltar ao login
            </Link>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Recuperar senha</CardTitle>
              <CardDescription>
                Informe o seu e-mail e enviaremos um link para redefinir a
                senha.
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
                  <Label htmlFor="fp-email">E-mail</Label>
                  <Input
                    id="fp-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={!canSubmit}
                >
                  {mutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Enviar link
                </Button>
              </form>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                <Link to="/login" className="underline">
                  Voltar ao login
                </Link>
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
