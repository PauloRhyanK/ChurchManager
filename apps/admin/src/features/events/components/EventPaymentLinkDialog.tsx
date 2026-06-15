import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Loader2, Link2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createEventTicketPaymentLink } from "@/features/events/api/tenant-event-ticket-types-api";
import type { EventTicketTypeDto } from "@/features/events/api/tenant-event-ticket-types-api";
import { fetchLinkPresets } from "@/features/financial/api/tenant-financial-api";
import { getApiErrorMessage } from "@/lib/api";

type Props = {
  eventId: string;
  ticketType: EventTicketTypeDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EventPaymentLinkDialog({ eventId, ticketType, open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [presetKey, setPresetKey] = useState<string>("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  const presetsQuery = useQuery({
    queryKey: ["link-presets"],
    queryFn: fetchLinkPresets,
    enabled: open,
  });

  const eventPresets = (presetsQuery.data ?? []).filter(
    (p) => p.module === "events" && p.active,
  );

  const linkMutation = useMutation({
    mutationFn: () =>
      createEventTicketPaymentLink(eventId, ticketType!.id, {
        name: name.trim() || ticketType!.name,
        presetKey: presetKey || undefined,
      }),
    onSuccess: (data) => {
      setGeneratedUrl(data.url);
      toast.success(data.metadata.reused ? "Link reutilizado." : "Link de pagamento criado.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      setGeneratedUrl(null);
      setPresetKey("");
      setName("");
    } else if (ticketType) {
      setName(ticketType.name);
    }
    onOpenChange(next);
  }

  async function copyUrl() {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    toast.success("Link copiado.");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Link de pagamento
          </DialogTitle>
          <DialogDescription>
            Gera ou reutiliza um link Asaas para o tipo «{ticketType?.name}». Use predefinições
            do módulo eventos em Configurações.
          </DialogDescription>
        </DialogHeader>

        {!generatedUrl ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="link-name">Nome no Asaas</Label>
              <Input
                id="link-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={ticketType?.name}
              />
            </div>

            <div className="space-y-2">
              <Label>Predefinição (opcional)</Label>
              <Select
                value={presetKey || "__none__"}
                onValueChange={(v) => setPresetKey(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem predefinição" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem predefinição</SelectItem>
                  {eventPresets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.presetKey}>
                      {preset.name} ({preset.presetKey})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {eventPresets.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma predefinição activa com módulo «events». Crie em Configurações.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>URL do link</Label>
            <div className="flex gap-2">
              <Input readOnly value={generatedUrl} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={copyUrl}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {!generatedUrl ? (
            <>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!ticketType || linkMutation.isPending}
                onClick={() => linkMutation.mutate()}
              >
                {linkMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar link
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => handleOpenChange(false)}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
