import { AlertTriangle, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccessLinkResult } from "../api/tenant-users-api";
import { CopyLinkButton } from "./CopyLinkButton";

export interface AccessLinkDialogData extends AccessLinkResult {
  kind: "password-reset" | "invite";
  email: string;
}

interface AccessLinkDialogProps {
  data: AccessLinkDialogData | null;
  onClose: () => void;
}

function formatExpiresAt(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function AccessLinkDialog({ data, onClose }: AccessLinkDialogProps) {
  const isInvite = data?.kind === "invite";

  return (
    <Dialog open={Boolean(data)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isInvite ? "Convite reenviado" : "Link de redefinição gerado"}
          </DialogTitle>
          <DialogDescription>
            {isInvite
              ? "O link anterior deixou de funcionar. Com este link, a pessoa define a senha e ativa o acesso."
              : "Com este link, a pessoa define uma nova senha. A senha atual continua a funcionar até ser trocada."}
          </DialogDescription>
        </DialogHeader>
        {data && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="access-link-url">Link</Label>
              <div className="flex gap-2">
                <Input
                  id="access-link-url"
                  value={data.url}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                />
                <CopyLinkButton value={data.url} label="Copiar" />
              </div>
              <p className="text-xs text-muted-foreground">
                Válido até {formatExpiresAt(data.expiresAt)}.
              </p>
            </div>
            {data.emailSent ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MailCheck className="h-4 w-4 text-primary" />
                E-mail enviado para {data.email}.
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Não foi possível enviar o e-mail — copie o link e envie
                manualmente.
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
