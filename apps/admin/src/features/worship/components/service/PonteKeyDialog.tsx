import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, getApiErrorMessage } from "@/lib/api";
import { fetchPonteKey, generatePonteKey, revokePonteKey } from "../../api/worship-api";

interface PonteKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;

/** Liga a Ponte do Culto a esta igreja: gera a chave com que ela lê o roteiro e as músicas. */
export function PonteKeyDialog({ open, onOpenChange }: PonteKeyDialogProps) {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ queryKey: ["worship", "ponte-key"], queryFn: fetchPonteKey, enabled: open });
  // A chave só existe na resposta de "gerar": fica na memória desta janela e some ao fechar.
  const [fresh, setFresh] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"generate" | "revoke" | null>(null);
  useEffect(() => {
    if (!open) {
      setFresh(null);
      setConfirming(null);
    }
  }, [open]);

  const done = (status: Awaited<ReturnType<typeof fetchPonteKey>>) => {
    queryClient.setQueryData(["worship", "ponte-key"], {
      active: status.active,
      hint: status.hint,
      createdAt: status.createdAt,
      lastUsedAt: status.lastUsedAt,
      path: status.path,
    });
    setConfirming(null);
  };
  const generate = useMutation({
    mutationFn: generatePonteKey,
    onSuccess: (out) => {
      setFresh(out.key);
      done(out);
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });
  const revoke = useMutation({
    mutationFn: revokePonteKey,
    onSuccess: (out) => {
      setFresh(null);
      done(out);
      toast.success("Chave revogada. A Ponte deixa de ler o roteiro.");
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const status = statusQuery.data;
  const address = status ? `${api.defaults.baseURL ?? ""}${status.path}` : "";

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copiado.`);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e use Ctrl+C.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </span>
            Ponte do Culto
          </DialogTitle>
          <DialogDescription>
            Com a chave, a Ponte lê o próximo culto e as músicas (letra, tempos, climas e o endereço do áudio). Ela não
            altera nada.
          </DialogDescription>
        </DialogHeader>

        {statusQuery.error ? (
          <p className="text-sm text-destructive">{getApiErrorMessage(statusQuery.error)}</p>
        ) : !status ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Endereço</span>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 text-[13px]">{address}</code>
                <Button variant="outline" size="icon" aria-label="Copiar o endereço" onClick={() => void copy(address, "Endereço")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {fresh ? (
              <div className="flex flex-col gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900">Chave nova</span>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md bg-background px-3 py-2 text-[13px]">{fresh}</code>
                  <Button variant="outline" size="icon" aria-label="Copiar a chave" onClick={() => void copy(fresh, "Chave")}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[13px] text-amber-900">
                  Copie agora e ponha no <code>config.yaml</code> da Ponte. Ela não aparece de novo: ao fechar esta
                  janela, só gerando outra.
                </p>
              </div>
            ) : (
              <p className="text-sm">
                {status.active ? (
                  <>
                    Há uma chave em uso (termina em <code>{status.hint}</code>), criada em {when(status.createdAt)}.{" "}
                    {status.lastUsedAt ? `Última leitura da Ponte: ${when(status.lastUsedAt)}.` : "A Ponte ainda não leu com ela."}
                  </>
                ) : (
                  "Nenhuma chave gerada: a Ponte ainda não consegue ler o roteiro daqui."
                )}
              </p>
            )}

            {confirming ? (
              <div className="flex flex-col gap-3 rounded-lg border p-3">
                <p className="text-sm">
                  {confirming === "generate"
                    ? "Gerar outra chave faz a atual parar de valer na hora. A Ponte fica sem ler o roteiro até receber a nova."
                    : "Revogar faz a Ponte parar de ler o roteiro e as músicas na hora."}
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setConfirming(null)}>
                    Cancelar
                  </Button>
                  <Button
                    variant={confirming === "revoke" ? "destructive" : "default"}
                    disabled={generate.isPending || revoke.isPending}
                    onClick={() => (confirming === "generate" ? generate.mutate() : revoke.mutate())}
                  >
                    {confirming === "generate" ? "Gerar outra chave" : "Revogar a chave"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                {status.active && (
                  <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirming("revoke")}>
                    Revogar
                  </Button>
                )}
                <Button
                  disabled={generate.isPending}
                  onClick={() => (status.active ? setConfirming("generate") : generate.mutate())}
                >
                  {status.active ? "Gerar outra chave" : "Gerar a chave"}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
