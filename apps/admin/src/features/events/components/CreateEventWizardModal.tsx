import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { createEvent } from "@/features/events/api/tenant-events-api";
import { EventTagsInput } from "@/features/events/components/EventTagsInput";
import {
  eventBasicSchema,
  type EventBasicValues,
} from "@/features/events/schemas/event-form-schema";
import { getApiErrorMessage } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateEventWizardModal({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<EventBasicValues>({
    resolver: zodResolver(eventBasicSchema),
    defaultValues: {
      title: "",
      shortDescription: "",
      date: "",
      timeStart: "",
      timeEnd: "",
      format: "IN_PERSON",
      location: "",
      onlineUrl: "",
      tags: [],
    },
  });

  const format = form.watch("format");

  const createMutation = useMutation({
    mutationFn: (values: EventBasicValues) =>
      createEvent({
        title: values.title.trim(),
        shortDescription: values.shortDescription?.trim() || null,
        date: values.date,
        timeStart: values.timeStart?.trim() || undefined,
        timeEnd: values.timeEnd?.trim() || undefined,
        format: values.format,
        location:
          values.format === "IN_PERSON" ? values.location?.trim() || null : null,
        onlineUrl:
          values.format === "ONLINE" ? values.onlineUrl?.trim() || null : null,
        tags: values.tags ?? [],
        published: false,
      }),
    onSuccess: (event) => {
      toast.success("Rascunho criado. Agora configure os ingressos.");
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["events-dashboard"] });
      onOpenChange(false);
      form.reset();
      navigate(`/eventos/${event.id}?tab=ingressos&onboarding=1`);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo evento</DialogTitle>
          <DialogDescription>
            Passo 1 de 2 — informações básicas. Os ingressos são configurados a
            seguir.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="ev-title">Título</Label>
            <Input id="ev-title" {...form.register("title")} />
            {form.formState.errors.title && (
              <p className="text-sm text-red-600">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ev-short">Descrição curta</Label>
            <Textarea
              id="ev-short"
              rows={2}
              placeholder="Resumo exibido nos cartões do site"
              {...form.register("shortDescription")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="ev-date">Data</Label>
              <Input id="ev-date" type="date" {...form.register("date")} />
              {form.formState.errors.date && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.date.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-start">Início</Label>
              <Input id="ev-start" type="time" {...form.register("timeStart")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-end">Fim</Label>
              <Input id="ev-end" type="time" {...form.register("timeEnd")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Formato</Label>
            <Controller
              control={form.control}
              name="format"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="IN_PERSON" id="fmt-in" />
                    <Label htmlFor="fmt-in" className="font-normal">
                      Presencial
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="ONLINE" id="fmt-on" />
                    <Label htmlFor="fmt-on" className="font-normal">
                      Online
                    </Label>
                  </div>
                </RadioGroup>
              )}
            />
          </div>

          {format === "ONLINE" ? (
            <div className="space-y-2">
              <Label htmlFor="ev-online">Link de transmissão</Label>
              <Input
                id="ev-online"
                type="url"
                placeholder="https://"
                {...form.register("onlineUrl")}
              />
              {form.formState.errors.onlineUrl && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.onlineUrl.message}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="ev-location">Local</Label>
              <Input id="ev-location" {...form.register("location")} />
            </div>
          )}

          <div className="space-y-2">
            <Label>Etiquetas</Label>
            <Controller
              control={form.control}
              name="tags"
              render={({ field }) => (
                <EventTagsInput
                  value={field.value ?? []}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Criar e configurar ingressos
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
