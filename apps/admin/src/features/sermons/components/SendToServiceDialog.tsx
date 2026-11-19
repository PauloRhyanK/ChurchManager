import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getApiErrorMessage } from "@/lib/api";
import {
  cancelDelivery,
  listServiceOptions,
  previewDelivery,
  sendSermon,
  type DeliveryPreview,
  type Sermon,
  type SendTarget,
} from "../api/sermons-api";
import { formatServiceLine, formatServiceSentence } from "../lib/format";

const OTHER = "other";

/** Hoje (AAAA-MM-DD) no relógio de quem usa o painel. */
function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

interface SendToServiceDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  sermonId: string;
  sermonTitle: string;
  /** Envio atual da palavra (nulo = rascunho). */
  delivery: Sermon["delivery"];
  /** Salva o que está na tela; resolve com `true` se não sobrou nada sem salvar. */
  ensureSaved(): Promise<boolean>;
  /** Aviso quando `ensureSaved` resolve `false` (padrão: pedir para salvar a palavra). */
  unsavedMessage?: string;
  /** Chamado depois de enviar ou cancelar, com a palavra devolvida pelo servidor. */
  onChanged(sermon: Sermon, action: "sent" | "cancelled"): void;
  /** Texto sob o título do diálogo (padrão: o título da palavra). */
  subtitle?: string;
}

export function SendToServiceDialog({
  open,
  onOpenChange,
  sermonId,
  sermonTitle,
  delivery,
  ensureSaved,
  unsavedMessage = "Salve a palavra antes de enviar.",
  onChanged,
  subtitle,
}: SendToServiceDialogProps) {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [debounced, setDebounced] = useState<{ date: string; time: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const options = useQuery({ queryKey: ["sermons", "service-options"], queryFn: listServiceOptions, enabled: open });

  useEffect(() => {
    if (!open) {
      setChoice("");
      setDate("");
      setTime("19:00");
      setDebounced(null);
    }
  }, [open]);

  const other = choice === OTHER;
  useEffect(() => {
    if (!other || !date || !time) {
      setDebounced(null);
      return;
    }
    const t = setTimeout(() => setDebounced({ date, time }), 300);
    return () => clearTimeout(t);
  }, [other, date, time]);

  const preview = useQuery<DeliveryPreview>({
    queryKey: ["sermons", "delivery-preview", debounced?.date, debounced?.time],
    queryFn: () => previewDelivery(debounced!.date, debounced!.time),
    enabled: open && other && debounced !== null,
  });

  const target: SendTarget | null = other
    ? date && time
      ? { date, startTime: time }
      : null
    : choice
      ? { serviceId: choice }
      : null;

  async function send(replace?: boolean) {
    if (!target) return;
    setBusy(true);
    try {
      if (!(await ensureSaved())) {
        toast.error(unsavedMessage);
        return;
      }
      const sent = await sendSermon(sermonId, target, replace);
      await queryClient.invalidateQueries({ queryKey: ["sermons", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["sermons", "service-options"] });
      // O roteiro do culto mostra a palavra enviada.
      await queryClient.invalidateQueries({ queryKey: ["worship"] });
      toast.success("Palavra enviada.");
      setConfirmReplace(false);
      onOpenChange(false);
      onChanged(sent, "sent");
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409 && error.response.data?.code === "SERVICE_HAS_SERMON") {
        setConfirmReplace(true);
      } else {
        toast.error(getApiErrorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      const back = await cancelDelivery(sermonId);
      await queryClient.invalidateQueries({ queryKey: ["sermons", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["sermons", "service-options"] });
      // O roteiro do culto mostra a palavra enviada.
      await queryClient.invalidateQueries({ queryKey: ["worship"] });
      toast.success("Envio cancelado.");
      setConfirmCancel(false);
      onOpenChange(false);
      onChanged(back, "cancelled");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const services = options.data ?? [];
  const previewText =
    other && debounced && debounced.date === date && debounced.time === time && preview.data
      ? preview.data.service
        ? preview.data.occupied
          ? `O culto de ${formatServiceSentence(preview.data.service.date, preview.data.service.startTime)} já tem uma palavra.`
          : `Entra no culto de ${formatServiceSentence(preview.data.service.date, preview.data.service.startTime)}.`
        : "Ainda não há culto nesse dia. A palavra fica guardada e entra sozinha quando ele for criado."
      : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar para um culto</DialogTitle>
            <DialogDescription>{subtitle ?? (sermonTitle.trim() || "Sem título")}</DialogDescription>
          </DialogHeader>

          <RadioGroup aria-label="Qual culto" value={choice} onValueChange={setChoice} className="max-h-[50vh] gap-2 overflow-y-auto">
            {options.isPending && <p className="text-sm text-muted-foreground">Carregando cultos…</p>}
            {!options.isPending && services.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum culto criado ainda.</p>
            )}
            {services.map((s) => {
              const note = s.id === delivery?.serviceId ? " · esta palavra" : s.hasSermon ? " · já tem uma palavra" : "";
              return (
                <label
                  key={s.id}
                  htmlFor={`culto-${s.id}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary"
                >
                  <RadioGroupItem id={`culto-${s.id}`} value={s.id} className="mt-1" />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{formatServiceLine(s.date, s.startTime)}</span>
                    <span className="text-sm text-muted-foreground">
                      {s.name}
                      {note}
                    </span>
                  </span>
                </label>
              );
            })}
            <div className="rounded-lg border p-3 has-[:checked]:border-primary">
              <label htmlFor="culto-outra" className="flex cursor-pointer items-center gap-3">
                <RadioGroupItem id="culto-outra" value={OTHER} />
                <span className="text-sm font-semibold">Outra data</span>
              </label>
              {other && (
                <div className="mt-3 flex flex-col gap-2 pl-7">
                  <div className="flex gap-2">
                    <input
                      type="date"
                      aria-label="Data"
                      min={todayYmd()}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <input
                      type="time"
                      aria-label="Hora"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                  </div>
                  {previewText && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {previewText}
                    </p>
                  )}
                </div>
              )}
            </div>
          </RadioGroup>

          <DialogFooter className="gap-2 sm:justify-between">
            {delivery ? (
              <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={() => setConfirmCancel(true)}>
                Cancelar o envio
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button type="button" disabled={!target || busy} onClick={() => send()}>
                Enviar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este culto já tem uma palavra. Trocar?</AlertDialogTitle>
            <AlertDialogDescription>A palavra que está no culto volta a ser rascunho.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void send(true);
              }}
            >
              Trocar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar o envio?</AlertDialogTitle>
            <AlertDialogDescription>A palavra sai do culto e volta a Rascunho.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void cancel();
              }}
            >
              Cancelar o envio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
